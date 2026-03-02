// STUB written by the test-writer (WS1 fills it). See tests/unit/registry.test.ts.
export type ToolStatus = 'live' | 'soon';

export interface Tool {
  id: string;
  slug: string;
  title: string;
  description: string;
  keywords: string[];
  status: ToolStatus;
  icon: string;
  /** For alias landing pages: the id of the tool they render. */
  alias?: string;
}

export const tools: Tool[] = [];
