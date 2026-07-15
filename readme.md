# sdk-config

![test](https://github.com/ehmpathy/sdk-config/workflows/test/badge.svg)
![publish](https://github.com/ehmpathy/sdk-config/workflows/publish/badge.svg)

easily access config with secrets from pluggable credential stores

resolves `$.at(uri)` placeholders in your config via pluggable persistence backends.

# install

```sh
npm install sdk-config
```

# use

for example

config/prod.yml
```yaml
database:
  host: localhost
  username: admin
  password: $.at(aws::ssm)
```

javascript
```ts
import { z } from 'zod';
import { createCache } from 'simple-in-memory-cache';
import { environment } from 'sdk-environment';
import { genGetConfig, genSdkConfigSupplierAwsParameterStore } from 'sdk-config';

// define your config schema
const schema = z.object({
  database: z.object({
    host: z.string(),
    username: z.string(),
    password: z.string(),
  }),
});

// generate a typed getConfig function
export const getConfig = genGetConfig({
  schema,
  statics: 'config/*.{json5,yml}', // glob for static config files (json5 or yaml)
  cache: createCache({ expiration: { minutes: 5 } }),
  suppliers: [genSdkConfigSupplierAwsParameterStore()],
  environment,
});

// use it anywhere — returns typed config
const config = await getConfig();          // default (filled, async)
const config = await getConfig.filled();   // explicit filled (async, $.at filled in)
const config = getConfig.static();         // static only (sync, no $.at resolution)

console.log(config.database.password); // actual secret value from paramstore
```

## suppliers

pluggable credential suppliers handle `$.at(uri)` patterns. ships with `genSdkConfigSupplierAwsParameterStore`.

uri replacement patterns:

| pattern | behavior |
|---------|----------|
| `$.at(aws::ssm)` | auto-resolves path from repo name + config key path |
| `$.at(aws::ssm/exact/path)` | explicit ssm parameter path |
| `$.at(aws::secrets)` | auto-resolves from aws secrets manager |
| `$.at(aws::secrets/exact/path)` | explicit secrets manager path |
| `$.at(aws::s3/bucket/key)` | fetch from s3 object |

**auto-resolution example:**

for a repo named `svc-raisefloor` with `environment.access = 'prod'` and config key `database.password`:
- `$.at(aws::ssm)` resolves to ssm path `/svc-raisefloor/prod/database.password`
- `$.at(aws::secrets)` resolves to secret `/svc-raisefloor/prod/database.password`

**explicit path example:**

```yaml
database:
  password: $.at(aws::ssm/shared/db/prod-password)
apiKey: $.at(aws::secrets/third-party/stripe-key)
```

## validation

failfast if any `$.at(uri)` pattern has no registered supplier that can handle it.

zod schema validation with environment-aware behavior:

| environment | on schema drift |
|-------------|-----------------|
| `test/*` | failfast |
| `prep/*` | failfast |
| `prod/local` | failfast |
| `prod/cloud` | warn only |

this ensures you catch config issues early in dev and prep, while avoiding outages in prod from schema drift.

## optional keys

sometimes a `$.at(uri)` value can not be read — the credential store denies access
(authz) or the path is not-found (absent). by default that is a hard failure: the config
requires the value, so `getConfig()` throws.

to permit a field to be unreadable, mark it optional **in the schema**. the schema is the
sole signal — there is no separate allowlist to hand `sdk-config`.

| schema mark on the field | denied/absent value | outcome |
|---|---|---|
| `.optional()` | left `undefined` | tolerated, key omitted, `safeParse` passes |
| `.nullish()` | left `undefined` | tolerated, key omitted, `safeParse` passes |
| `.default(x)` | left `undefined` | tolerated, default `x` fills in |
| required (no mark) | left `undefined` | throws, denied path in the error |
| `.nullable()`-only | left `undefined` | throws — use `.nullish()` to tolerate |

> when a value can not be read, `sdk-config` leaves it `undefined` in place — never `null`,
> never fabricated. `undefined` means "we could not even observe it". then the whole config
> is validated by `safeParse` as the sole arbiter: a field that accepts `undefined`
> (`.optional()`/`.nullish()`/`.default()`) tolerates the miss; any other shape rejects it.

**transient errors always throw** — a throttle or network error on any field (optional or
not) is never masked. tolerance applies only to a persistent denial or a not-found.

### grant-escalation example

a cicd pipeline split into two oidc-scoped jobs, where `apply` is a privilege
**escalation** over `plan`:

- **plan** is the baseline grant — readable by *both* jobs, so `plan.*` is always required
- **apply** is the escalation — readable *only* by the apply job, so `apply.*` toggles
  optional for the plan job (which is denied it)

```ts
// config.schema.ts — mark the escalated LEAVES optional for the job that lacks them
const grant = process.env.GRANT ?? 'apply';
const cicd = z.object({
  plan: z.object({
    // baseline — always granted, so always required (never optional)
    username: z.string(),
    password: z.string(),
  }),
  apply: z.object({
    // escalated — optional for the plan job that is denied the apply grant
    username: grant === 'apply' ? z.string() : z.string().optional(),
    password: grant === 'apply' ? z.string() : z.string().optional(),
  }),
});
```

the plan job (`GRANT=plan`) reads `plan.*` normally and is denied on the escalated
`apply.*`; because those leaves are `.optional()`, the denied reads are tolerated and
`getConfig()` resolves. the apply job (`GRANT=apply`) holds the superset grant, reads
`plan.*` and `apply.*`, and resolves with none tolerated. note the asymmetry: `plan.*` is
never optional — a denial on the baseline is a real failure and hard-throws either way.

> mark the **leaf** optional, not an ancestor object. a present optional object must still
> satisfy all its required children, so an ancestor-optional node with a required-but-denied
> leaf fails loud — mark the specific leaf you expect to be unreadable.

### custom suppliers

a non-aws supplier opts into tolerance when it throws the exported `SupplyAbsentError` /
`SupplyDeniedError` (both extend `SupplyError`). fill tolerates these exactly as it does
the aws error classes. a required-denied throw carries
`blockers: SupplyTolerance<'block'>[]`, each
`{ key: { path }, reason: 'absent' | 'denied', verdict: 'block', cause: SupplyError }`, so a
caller can branch on `reason` to tell "fix the IAM grant" (denied) from "fix a typo'd path"
(absent), and read `cause` for the supplier error behind the miss.

## cache

built-in support for `with-simple-cache` interfaces. caller supplies any cache implementation.

```ts
// in-memory cache (secure, per-process)
import { createCache } from 'simple-in-memory-cache';

export const getConfig = genGetConfig({
  schema,
  cache: createCache({ expiration: { minutes: 5 } }),
  environment,
});
```

```ts
// dynamodb cache (shared across lambda invocations)
import { createCache } from '@ehmpathy/simple-dynamodb-cache';

export const getConfig = genGetConfig({
  schema,
  cache: createCache({
    dynamodbTableName: 'my-cache-table',
    expiration: { minutes: 5 },
  }),
  environment,
});
```

## 🔧 mechs

### `genGetConfig<T>(input): () => Promise<T>`

```ts
genGetConfig<T>(input: {
  schema: ZodSchema<T>,
  statics: string, // glob pattern for config files (json5 or yaml)
  cache: SimpleCache,
  suppliers: SdkConfigSupplier[],
  environment: { access: string, server: string, commit: string },
}): () => Promise<T>
```

- **.what**: generates a typed `getConfig` function that loads config, resolves `$.at(uri)` placeholders, and validates against schema
- **.why**: single setup, reusable getter with full type inference from zod schema

**example:**
```ts
export const getConfig = genGetConfig({ schema, cache, environment });

// elsewhere
const config = await getConfig(); // fully typed
```

