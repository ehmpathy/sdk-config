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

