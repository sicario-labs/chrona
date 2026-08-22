# Agent Execution Framework Rules

This codebase implements the core agent execution harness.

## Entry Point
- `createAgent(model: string, tools?: ToolDefinition[])`: Factory for `AgentHarness`.

## Rules
- All agent invocations must be dispatched through `createAgent`.
