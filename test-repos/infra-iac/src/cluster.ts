export interface ClusterConfig {
  name: string;
  region: string;
  nodes: number;
}

export function provisionCluster(config: ClusterConfig): { id: string; status: string } {
  return {
    id: `cls_${config.name}`,
    status: 'provisioning',
  };
}
