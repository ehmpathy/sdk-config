# sdk-config

typed config with pluggable credential suppliers.

## install

```bash
npm install sdk-config
```

## usage

### before

```ts
// manual cache wrap required
import ConfigCache from 'config-with-paramstore';
import { withSimpleCachingAsync } from 'with-simple-caching';

const configInstance = new ConfigCache();
const getConfig = withSimpleCachingAsync(
  async () => configInstance.get(stage),
  {
    cache: createCache({ ... }),
    serialize: { key: ({ forInput }) => [...].join('.') },
  },
);

// no type safety
const config = await getConfig();
config.databse.password; // typo not caught
```

### after

```ts
import { z } from 'zod';
import { environment } from 'sdk-environment';
import { genGetConfig, genSdkConfigSupplierAwsParameterStore } from 'sdk-config';

const schema = z.object({
  database: z.object({ host: z.string(), password: z.string() }),
});

export const getConfig = genGetConfig({
  schema,
  statics: 'config/*.{json5,yml}',
  cache: createCache({ expiration: { minutes: 5 } }),
  suppliers: [genSdkConfigSupplierAwsParameterStore()],
  environment,
});

const config = await getConfig();
config.databse.password; // typescript error!
```

## aha moment

when a developer:
1. writes `$.at(aws::param)` in yaml and it just works — no path construction
2. gets full intellisense on `config.database.password` from zod inference
3. deploys to prod and schema drift warns instead of crash at 3am

## config file

create `config/test.yml`, `config/prep.yml`, `config/prod.yml`:

```yaml
database:
  host: localhost
  password: $.at(aws::param)
```

the `$.at()` placeholder auto-resolves to `/repo-name/access/database.password`.

## api

### genGetConfig

factory that returns a typed config getter.

```ts
const getConfig = genGetConfig({
  schema,           // zod schema for validation + type inference
  statics,          // glob pattern for config files
  cache,            // with-simple-cache instance
  suppliers,        // array of credential suppliers
  environment,      // SdkConfigEnvironment { access, compute }
  repoName?,        // optional override (defaults to package.json name)
});
```

### suppliers

- `genSdkConfigSupplierAwsParameterStore()` — fetch from ssm parameter store
- `genSdkConfigSupplierAwsSecretsManager()` — fetch from secrets manager

## validation

| environment | behavior |
|-------------|----------|
| test | failfast |
| prep | failfast |
| prod + local | failfast |
| prod + cloud | warn only |

prod/cloud warns instead of crash to avoid 3am pages on schema drift.
