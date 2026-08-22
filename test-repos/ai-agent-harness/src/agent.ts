export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export class AgentHarness {
  private model: string;
  private tools: ToolDefinition[];

  constructor(model: string, tools: ToolDefinition[] = []) {
    this.model = model;
    this.tools = tools;
  }

  async runTask(prompt: string): Promise<{ result: string; steps: number }> {
    return { result: `Completed: ${prompt}`, steps: 1 };
  }
}

export function createAgent(model: string, tools?: ToolDefinition[]): AgentHarness {
  return new AgentHarness(model, tools);
}
