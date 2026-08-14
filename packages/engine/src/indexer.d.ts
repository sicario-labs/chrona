import { Project } from 'ts-morph';
import { type IndexOptions, type RepositoryIndex } from '@/types';
export declare function indexProject(options?: IndexOptions): Promise<RepositoryIndex>;
export declare function indexProjectFromProject(project: Project, options?: IndexOptions): Promise<RepositoryIndex>;
