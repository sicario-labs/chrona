import type { ChronaSymbolData } from '@chrona/intelligence';
import Link from 'chrona-core/link';

export function RepositoryPage({ data }: { data: ChronaSymbolData }) {
  const evidence = data._chrona;
  const refPath = evidence.filePath.replace(/^.*\/fumadocs-dev\//, '');
  const neighbors = evidence.graph ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-md border px-2 py-0.5 text-sm font-medium text-fd-primary bg-fd-primary/10">
          {evidence.kind}
        </span>
        <code className="font-mono text-sm text-fd-muted-foreground">{refPath}</code>
        {evidence.deprecated && (
          <span className="rounded-md border border-fd-warning px-2 py-0.5 text-xs text-fd-warning">
            deprecated
          </span>
        )}
        {evidence.internal && (
          <span className="rounded-md border px-2 py-0.5 text-xs text-fd-muted-foreground">
            internal
          </span>
        )}
      </div>

      <div className="prose">
        {data.description && <p>{data.description}</p>}
        {!data.description && (
          <p className="text-fd-muted-foreground">
            This page was generated from the repository symbol index.
          </p>
        )}
      </div>

      {evidence.aliases.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Aliases</h2>
          <div className="flex flex-wrap gap-1.5">
            {evidence.aliases.map((alias) => (
              <code key={alias} className="rounded-md bg-fd-secondary px-1.5 py-0.5 text-xs">
                {alias}
              </code>
            ))}
          </div>
        </section>
      )}

      {neighbors.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">Graph neighbors</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            {neighbors.map((neighbor) => (
              <div
                key={neighbor.id}
                className="flex items-center gap-2 rounded-lg border p-2 text-sm"
              >
                <span className="rounded-md bg-fd-primary/10 px-1.5 py-0.5 text-xs text-fd-primary">
                  {neighbor.kind}
                </span>
                <Link
                  href={symbolPath(neighbor.id, neighbor.name)}
                  className="font-mono text-fd-accent-foreground hover:underline"
                >
                  {neighbor.name}
                </Link>
              </div>
            ))}
          </div>
        </section>
      )}

      {evidence.references.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">
            References ({evidence.references.length})
          </h2>
          <ul className="flex flex-col gap-1">
            {evidence.references.slice(0, 10).map((ref, i) => (
              <li key={i} className="text-sm">
                <code className="text-fd-muted-foreground">
                  {ref.filePath.replace(/^.*\/fumadocs-dev\//, '')}:{ref.line}
                </code>
              </li>
            ))}
            {evidence.references.length > 10 && (
              <li className="text-sm text-fd-muted-foreground">
                … and {evidence.references.length - 10} more
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}

function symbolPath(id: string, name: string): string {
  const file = id.split('#')[0].replace(/^.*\/packages\//, '');
  const segments = file
    .split('/')
    .slice(0, -1)
    .filter((v) => v.length > 0 && v !== 'node_modules');
  return `/docs/repository/(generated)/${[...segments, name].join('/')}`;
}
