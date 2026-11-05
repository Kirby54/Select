import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderSetup } from "./provider-setup";
import { api } from "@/lib/api";

vi.mock("@/lib/api", () => ({
  api: vi.fn(),
  errorMessage: (error: unknown) => error instanceof Error ? error.message : "Unknown error",
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ProviderSetup generation verification", () => {
  it("supports accessible arrow-key navigation across providers", () => {
    render(<ProviderSetup cid="company-1" onDone={vi.fn()} />);
    const radios = screen.getAllByRole("radio") as HTMLButtonElement[];
    expect(radios[0].getAttribute("tabindex")).toBe("0");
    radios[0].focus();
    fireEvent.keyDown(radios[0], { key: "ArrowRight" });
    expect(radios[1].getAttribute("aria-checked")).toBe("true");
    expect(document.activeElement).toBe(radios[1]);
    expect(radios[1].getAttribute("tabindex")).toBe("0");
  });
  it("distinguishes model discovery from an actual generated result", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("/test")) return {
        last_test_ok: true,
        models: ["model-1", "model-2"],
      } as never;
      if (path.endsWith("/probe")) return {
        ok: true,
        model: "model-1",
        input_tokens: 10,
        output_tokens: 4,
        error: null,
      } as never;
      return {} as never;
    });
    render(<ProviderSetup cid="company-1" onDone={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect and test" }));

    expect(await screen.findByText(/generation not yet verified/)).toBeTruthy();
    expect(screen.queryByText("Generation verified")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Test generation" }));
    expect(await screen.findByText("Generation verified")).toBeTruthy();
    expect(screen.getByText(/10 input tokens · 4 output tokens/)).toBeTruthy();
    expect(vi.mocked(api)).toHaveBeenCalledWith(
      "/companies/company-1/connections/anthropic/probe",
      { method: "POST", body: { model: "model-1", consent: true } },
    );

    fireEvent.change(screen.getByLabelText("Model for every agent"), { target: { value: "model-2" } });
    await waitFor(() => expect(screen.queryByText("Generation verified")).toBeNull());
    expect(screen.getByText(/ability to generate a result is unverified/)).toBeTruthy();
  });

  it("keeps a failed generation test visibly distinct from model listing", async () => {
    vi.mocked(api).mockImplementation(async (path) => {
      if (path.endsWith("/test")) return { last_test_ok: true, models: ["model-1"] } as never;
      if (path.endsWith("/probe")) return {
        ok: false, model: "model-1", input_tokens: 0, output_tokens: 0, error: "Provider unavailable",
      } as never;
      return {} as never;
    });
    render(<ProviderSetup cid="company-1" onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("API key"), { target: { value: "test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect and test" }));
    expect(await screen.findByText(/generation not yet verified/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Test generation" }));
    expect(await screen.findByText("Generation test failed")).toBeTruthy();
    expect(screen.getByText("Provider unavailable")).toBeTruthy();
    expect(screen.queryByText("Generation verified")).toBeNull();
  });
});
