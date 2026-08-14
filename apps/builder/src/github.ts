export interface GitHubFile {
  path: string;
  type: 'blob' | 'tree';
  sha: string;
  url: string;
}

export async function fetchTree(owner: string, repo: string, sha: string, token?: string): Promise<GitHubFile[]> {
  const headers: Record<string, string> = {
    'User-Agent': 'Chrona-Builder',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${sha}?recursive=1`, { headers });
  
  if (!res.ok) {
    throw new Error(`GitHub API Error: ${res.statusText}`);
  }

  const data = await res.json() as { tree: GitHubFile[] };
  return data.tree;
}

export async function fetchBlob(owner: string, repo: string, sha: string, path: string, token?: string): Promise<string> {
  const headers: Record<string, string> = {
    'User-Agent': 'Chrona-Builder',
  };
  if (token) headers.Authorization = `token ${token}`;

  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${sha}/${path}`, { headers });
  if (!res.ok) {
    throw new Error(`GitHub Raw Error: ${res.statusText}`);
  }

  return await res.text();
}
