import { compile } from '@mdx-js/mdx';
import matter from 'gray-matter';
import { source, type VirtualFile, loader } from 'chrona-core/source';
import { fetchBlob, fetchTree, type GitHubFile } from './github';

export interface CompilerResult {
  pageTree: any;
  pages: Record<string, { compiled: string; frontmatter: any }>;
}

export async function compileRepo(
  owner: string, 
  repo: string, 
  sha: string, 
  token?: string
): Promise<CompilerResult> {
  // 1. Fetch entire repo tree
  const tree = await fetchTree(owner, repo, sha, token);

  // 2. Filter for documentation files (md/mdx) and metas (meta.json)
  const docsFiles = tree.filter(f => 
    f.type === 'blob' && 
    (f.path.endsWith('.md') || f.path.endsWith('.mdx') || f.path.endsWith('meta.json')) &&
    !f.path.includes('node_modules')
  );

  const virtualFiles: VirtualFile<any>[] = [];
  const pages: Record<string, { compiled: string; frontmatter: any }> = {};

  // 3. Fetch all files in parallel (chunked if needed, but let's do all for now)
  const fetchPromises = docsFiles.map(async (file) => {
    const content = await fetchBlob(owner, repo, sha, file.path, token);
    
    if (file.path.endsWith('meta.json')) {
      try {
        const data = JSON.parse(content);
        virtualFiles.push({
          type: 'meta',
          path: file.path,
          data
        });
      } catch (e) {
        console.error(`Failed to parse meta.json at ${file.path}`);
      }
    } else {
      // It's a page (MD/MDX)
      const parsed = matter(content);
      const frontmatter = parsed.data;
      
      virtualFiles.push({
        type: 'page',
        path: file.path,
        data: frontmatter
      });

      // Compile MDX to a function body compatible with React
      // We target 'function-body' format which next-mdx-remote and similar tools use
      const compiled = await compile(content, {
        outputFormat: 'function-body',
        development: false,
        // remarkPlugins, rehypePlugins can be added here
      });

      pages[file.path] = {
        compiled: String(compiled),
        frontmatter
      };
    }
  });

  await Promise.all(fetchPromises);

  // 4. Construct the static source and generate the page tree
  // The 'loader' takes the static source and outputs the PageTree
  const staticSource = source({
    pages: virtualFiles.filter(f => f.type === 'page') as any,
    metas: virtualFiles.filter(f => f.type === 'meta') as any
  });

  const utils = loader({
    source: staticSource,
    baseUrl: '/docs',
    // We can add pageTree options here
  });

  const pageTree = utils.pageTree;

  // We could serialize it, but it's already a plain object since we didn't add React node icons yet.
  // We'll use serializePageTree to make sure it's fully sanitized for the edge
  const serializedTree = await utils.serializePageTree(pageTree as any);

  return {
    pageTree: serializedTree,
    pages
  };
}
