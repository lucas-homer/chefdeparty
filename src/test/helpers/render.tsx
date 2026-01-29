/**
 * Custom render helper for React component testing.
 * Use this when testing client-side React components (islands).
 *
 * @vitest-environment jsdom
 */

import React from "react";
import { render, RenderOptions, RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Re-export everything from testing-library
export * from "@testing-library/react";
export { userEvent };

/**
 * Custom render options for ChefDeParty components.
 */
interface CustomRenderOptions extends Omit<RenderOptions, "wrapper"> {
  // Add any app-specific providers or context here
  initialRoute?: string;
}

/**
 * Creates a wrapper component with any necessary providers.
 * Currently this is simple since the client components don't use
 * global context providers, but this can be extended as needed.
 */
function createWrapper() {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <>{children}</>;
  };
}

/**
 * Custom render function that wraps components with necessary providers.
 *
 * @example
 * import { customRender, screen, userEvent } from "@/test/helpers/render";
 *
 * test("button click works", async () => {
 *   const user = userEvent.setup();
 *   customRender(<MyComponent />);
 *
 *   await user.click(screen.getByRole("button", { name: /save/i }));
 *   expect(screen.getByText(/saved/i)).toBeInTheDocument();
 * });
 */
export function customRender(
  ui: React.ReactElement,
  options: CustomRenderOptions = {}
): RenderResult & { user: ReturnType<typeof userEvent.setup> } {
  const user = userEvent.setup();
  const Wrapper = createWrapper();

  const renderResult = render(ui, {
    wrapper: Wrapper,
    ...options,
  });

  return {
    ...renderResult,
    user,
  };
}

/**
 * Helper to create a mock fetch response.
 * Useful for mocking API calls in component tests.
 *
 * @example
 * vi.spyOn(global, "fetch").mockResolvedValue(
 *   mockFetchResponse({ success: true })
 * );
 */
export function mockFetchResponse(
  data: unknown,
  options: { status?: number; ok?: boolean } = {}
): Response {
  const { status = 200, ok = true } = options;
  return {
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "Content-Type": "application/json" }),
    clone: () => mockFetchResponse(data, options),
  } as Response;
}

/**
 * Helper to wait for async operations in tests.
 * Use this when you need to wait for state updates or API calls.
 */
export async function waitForAsync(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Default export for convenient importing.
 */
export default customRender;
