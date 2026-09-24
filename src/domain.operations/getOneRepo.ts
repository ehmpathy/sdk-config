import { BadRequestError } from 'helpful-errors';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RepoSlug } from '../domain.objects/RepoSlug';
import { isSdkConfigPlaceholder } from './isSdkConfigPlaceholder';

/**
 * .what = read the repo from the config's `repository` field, else package.json `name`
 * .why = the repo is the second segment of every auto-derived path
 *
 * .note = TWO sources, and neither is an argument. the config declares it, as
 *         `organization` does; else the package.json `name` is the default.
 *         ⛔ do NOT add a `genGetConfig({ repo })` override — a third source is
 *         what let `repo: 'ehmpathy/svc-x'` pre-supply an org the derive now
 *         supplies (`rule.forbid.combinatorial-explosion`).
 *
 * .note = an npm SCOPE is stripped: `@ehmpathy/svc-x` yields `svc-x`. the scope
 *         names the org, and the org is its own segment.
 *
 * @example from the config
 * getOneRepo({ static: { repository: 'svc-x' }, cwd: null })
 * // → 'svc-x'
 *
 * @example from package.json
 * getOneRepo({ static: {}, cwd: null })
 * // → reads `name`, scope stripped
 */
export const getOneRepo = (input: {
  static: Record<string, unknown>;
  cwd: string | null;
}): RepoSlug => {
  // the config declares it — the explicit route, symmetric with `organization`
  const declared = input.static.repository;
  if (declared !== undefined)
    return asRepoSegment({
      value: declared,
      where: 'the `repository` field declared in the config',
      path: null,
    });

  // else the package.json `name` — the ergonomic default
  const cwd = input.cwd ?? process.cwd();
  const packagePath = join(cwd, 'package.json');

  // read the file. a READ failure is never a PARSE failure — one try block
  // around both forced a catch to GUESS which had failed, so an EACCES or an
  // EISDIR reported a syntax problem for a file that was never opened
  const content = ((): string => {
    try {
      return readFileSync(packagePath, 'utf-8');
    } catch (error) {
      // ⛔ do NOT rewrite as `error instanceof Error`. under jest the fs
      //    module's `Error` global is a different vm realm than the test
      //    file's, so it is FALSE for a real ENOENT. `typeof === 'object'` is
      //    realm-agnostic, which is what matters at a node stdlib boundary
      const errorCode =
        typeof error === 'object' && error !== null && 'code' in error
          ? error.code
          : null;
      if (errorCode === 'ENOENT')
        throw new BadRequestError('package.json not found', {
          path: packagePath,
          hint: 'declare a top-level `repository` in the config, or ensure package.json exists',
        });

      // any other read failure names ITSELF, over a borrowed syntax verdict
      throw new BadRequestError('package.json could not be read', {
        path: packagePath,
        code: errorCode,
        error: asErrorMessage({ error }),
        hint: 'the file exists but could not be read — check its permissions and that the path is a file, not a directory. this is NOT a syntax problem; the file was never opened',
      });
    }
  })();

  // parse it. this catch wraps ONLY the parse, so "parse failed" is a fact.
  // the result is `unknown` — the guards below are what establish its shape
  const packageJson = ((): unknown => {
    try {
      return JSON.parse(content);
    } catch (error) {
      throw new BadRequestError('package.json parse failed', {
        path: packagePath,
        error: asErrorMessage({ error }),
        hint: 'check package.json syntax',
      });
    }
  })();

  // a SUCCESSFUL parse can still yield a non-object — `null`, `42`, `[]` are
  // each valid json, and a `.name` read on `null` throws a bare `TypeError`
  if (
    typeof packageJson !== 'object' ||
    packageJson === null ||
    Array.isArray(packageJson)
  )
    throw new BadRequestError('package.json is not a json object', {
      path: packagePath,
      found: asJsonKind({ value: packageJson }),
      hint: 'package.json must hold a json OBJECT at its root. the file parsed cleanly, so this is NOT a syntax problem — its top level is the wrong kind of value',
    });

  const nameFound: unknown = 'name' in packageJson ? packageJson.name : null;

  // ABSENT — the key is not in the file at all
  //
  // ⛔ do NOT merge with the blank guard in `asRepoSegment`. a reader sent to
  //    *"add a name field"* for a `"name": ""` finds it already there
  if (nameFound === null || nameFound === undefined)
    throw new BadRequestError('package.json name field is absent', {
      path: packagePath,
      hint: 'add a name field to package.json, or declare a top-level `repository` in the config',
    });

  // the path rides along, so every throw on THIS route names the file the
  // absent-key throw above names — a monorepo has many package.json
  return asRepoSegment({
    value: nameFound,
    where: 'the `name` field in package.json',
    path: packagePath,
  });
};

/**
 * .what = read an unknown throwable's message, without an `instanceof` test
 * .why = `error instanceof Error` is FALSE for a real fs error under jest — the
 *        `fs` module's `Error` global is a different vm realm than the test
 *        file's, so the check misses and yields `"Error: EISDIR: …"` over the
 *        bare message
 */
const asErrorMessage = (input: { error: unknown }): string => {
  const { error } = input;
  if (typeof error === 'object' && error !== null && 'message' in error)
    return String(error.message);
  return String(error);
};

/**
 * .what = name the json KIND of a value, for an error a reader can act on
 * .why = `typeof` reports `object` for both `null` and `[]` — the two shapes
 *        that actually reach these guards
 */
const asJsonKind = (input: { value: unknown }): string => {
  if (input.value === null) return 'null';
  if (Array.isArray(input.value)) return 'array';
  return typeof input.value;
};

/**
 * .what = assert a literal non-empty string, strip an npm scope and wrapper slashes
 * .why = the twin of `getOneOrg`'s `asOrgSegment` — both segments are spliced
 *        raw into one path, so a non-literal renders as `[object Object]` and a
 *        wrapper slash yields `//svc-x/…`, invalid ssm names either way
 *
 * .note = the scope strip is a FIX: `@ehmpathy/svc-x` once derived
 *         `/ehmpathy/@ehmpathy/svc-x/…` — five segments, no error.
 *         ⛔ do NOT grow this into a charset gate; `repo` and `org` are
 *         ungated alike (F7).
 */
const asRepoSegment = (input: {
  value: unknown;
  where: string;
  path: string | null;
}): RepoSlug => {
  const { where, path } = input;

  // the locator rides only where a FILE is the source — the config route has
  // no path to name, and a `"path": null` reads as a defect
  const locator = path ? { path } : {};

  if (typeof input.value !== 'string')
    throw new BadRequestError('repo must be a literal string', {
      source: where,
      ...locator,
      declared: input.value,
      declaredType: typeof input.value,
      hint: `${where} must hold a literal string, such as "svc-raisefloor"`,
    });

  // a placeholder can never be filled here — the repo is read BEFORE any
  // supplier runs, because it is what tells the supplier which path to read
  if (isSdkConfigPlaceholder({ value: input.value }))
    throw new BadRequestError('repo cannot be a placeholder', {
      source: where,
      ...locator,
      declared: input.value,
      hint: `${where} must hold a literal value, never a $.at() placeholder. the repo is read before any supplier runs — it is what decides the path a supplier reads — so it cannot itself be supplied`,
    });

  // strip an npm scope, then the wrapper slashes and whitespace. the `.trim()`
  // carries weight: `'   '` is the one malformed value `typeof` cannot catch
  const unscoped = input.value.replace(/^@[^/]+\//, '');
  const trimmed = unscoped.replace(/^\/+/, '').replace(/\/+$/, '').trim();

  if (!trimmed.length)
    throw new BadRequestError('repo is empty', {
      source: where,
      ...locator,
      declared: input.value,
      hint: `${where} must hold a non-empty value — an empty repo would splice a blank segment and derive an unreachable path`,
    });

  return trimmed;
};
