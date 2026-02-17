import { describe, expect, it } from "vitest";
import { getWizardTools } from "../party-wizard-tools";
import { confirmPartyInfoAction } from "./party-info";
import {
  addGuestAction,
  confirmGuestListAction,
  removeGuestAction,
} from "./guests";
import type { WizardState } from "../wizard-schemas";

type Writable = { write: (chunk: unknown) => void };

function sanitizeRequestId(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const copy = structuredClone(value) as Record<string, unknown>;
  if (copy && typeof copy === "object" && "id" in copy) {
    copy.id = "<id>";
  }
  return copy;
}

describe("party wizard actions parity", () => {
  it("keeps confirmPartyInfo tool output and request structure aligned", async () => {
    const writesFromTool: unknown[] = [];
    const writesFromAction: unknown[] = [];

    const toolCurrentData: Partial<WizardState> = {};
    const actionCurrentData: Partial<WizardState> = {};

    const tools = getWizardTools("party-info", {
      db: {} as never,
      userId: "test-user",
      env: {} as never,
      currentData: toolCurrentData,
      sessionId: undefined,
      referenceNow: new Date("2026-02-16T09:00:00.000Z"),
      writer: { write: (chunk: unknown) => writesFromTool.push(chunk) } as unknown as Writable,
    });

    const confirmTool = tools.confirmPartyInfo as {
      execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };

    const toolResult = await confirmTool.execute({
      name: "Happy Birthday to Me",
      dateTimeInput: "this Sunday at 1pm",
      location: "Rory's place",
    });

    const actionResult = await confirmPartyInfoAction(
      {
        db: {} as never,
        userId: "test-user",
        sessionId: undefined,
        currentData: actionCurrentData,
        referenceNow: new Date("2026-02-16T09:00:00.000Z"),
        writer: { write: (chunk: unknown) => writesFromAction.push(chunk) } as never,
      },
      {
        name: "Happy Birthday to Me",
        dateTimeInput: "this Sunday at 1pm",
        location: "Rory's place",
      }
    );

    expect(toolResult).toMatchObject({
      success: true,
      action: "awaitingConfirmation",
      message: "Please confirm the party details above.",
    });
    expect(actionResult).toMatchObject({
      success: true,
      action: "awaitingConfirmation",
      message: "Please confirm the party details above.",
    });

    expect(writesFromTool).toHaveLength(1);
    expect(writesFromAction).toHaveLength(1);

    const toolRequest = sanitizeRequestId((writesFromTool[0] as { data?: { request?: unknown } }).data?.request);
    const actionRequest = sanitizeRequestId((writesFromAction[0] as { data?: { request?: unknown } }).data?.request);
    expect(toolRequest).toEqual(actionRequest);
  });

  it("keeps add/remove/confirm guest behavior aligned", async () => {
    const toolData: Partial<WizardState> = {
      guestList: [{ name: "Amy", email: "amy@gmail.com", phone: undefined }],
    };
    const actionData: Partial<WizardState> = {
      guestList: [{ name: "Amy", email: "amy@gmail.com", phone: undefined }],
    };

    const writesFromTool: unknown[] = [];
    const writesFromAction: unknown[] = [];

    const tools = getWizardTools("guests", {
      db: {} as never,
      userId: "test-user",
      env: {} as never,
      currentData: toolData,
      sessionId: undefined,
      writer: { write: (chunk: unknown) => writesFromTool.push(chunk) } as unknown as Writable,
    });

    const addTool = tools.addGuest as {
      execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    const removeTool = tools.removeGuest as {
      execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };
    const confirmTool = tools.confirmGuestList as {
      execute: (input: Record<string, unknown>) => Promise<Record<string, unknown>>;
    };

    const toolAdd = await addTool.execute({ name: "Bob", email: "bob@test.com" });
    const actionAdd = await addGuestAction(
      { db: {} as never, userId: "test-user", sessionId: undefined, currentData: actionData },
      { name: "Bob", email: "bob@test.com" }
    );

    expect(toolAdd).toMatchObject(actionAdd);

    const toolRemove = await removeTool.execute({ index: 0 });
    const actionRemove = await removeGuestAction(
      { db: {} as never, userId: "test-user", sessionId: undefined, currentData: actionData },
      { index: 0 }
    );

    expect(toolRemove).toMatchObject(actionRemove);

    const toolConfirm = await confirmTool.execute({});
    const actionConfirm = await confirmGuestListAction(
      {
        db: {} as never,
        userId: "test-user",
        sessionId: undefined,
        currentData: actionData,
        writer: { write: (chunk: unknown) => writesFromAction.push(chunk) } as never,
      }
    );

    expect(toolConfirm).toMatchObject({
      success: true,
      action: "awaitingConfirmation",
      message: "Please confirm the guest list above.",
    });
    expect(actionConfirm).toMatchObject({
      success: true,
      action: "awaitingConfirmation",
      message: "Please confirm the guest list above.",
    });

    expect(writesFromTool).toHaveLength(1);
    expect(writesFromAction).toHaveLength(1);

    const toolRequest = sanitizeRequestId((writesFromTool[0] as { data?: { request?: unknown } }).data?.request);
    const actionRequest = sanitizeRequestId((writesFromAction[0] as { data?: { request?: unknown } }).data?.request);
    expect(toolRequest).toEqual(actionRequest);
  });
});
