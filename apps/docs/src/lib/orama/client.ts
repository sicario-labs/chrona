import { OramaCloud } from '@orama/core';

export const DataSourceId = process.env.NEXT_PUBLIC_ORAMA_DATASOURCE_ID as string;

export const isAdmin = process.env.ORAMA_PRIVATE_API_KEY !== undefined;

const projectId = process.env.NEXT_PUBLIC_ORAMA_PROJECT_ID;
const apiKey = process.env.ORAMA_PRIVATE_API_KEY ?? process.env.NEXT_PUBLIC_ORAMA_API_KEY;

let client: OramaCloud | undefined;

function getOrama(): OramaCloud {
  if (!projectId || !apiKey) {
    throw new Error('Orama credentials are not configured (NEXT_PUBLIC_ORAMA_PROJECT_ID / NEXT_PUBLIC_ORAMA_API_KEY)');
  }

  return (client ??= new OramaCloud({ projectId, apiKey }));
}

export const orama = new Proxy(
  {},
  {
    get(_target, prop, receiver) {
      const instance = getOrama();
      const value = Reflect.get(instance, prop, instance);

      return typeof value === 'function' ? value.bind(instance) : value;
    },
  },
) as OramaCloud;