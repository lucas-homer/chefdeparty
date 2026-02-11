/** @vitest-environment jsdom */

import { render, screen } from "@testing-library/react";

import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";

describe("Form control primitives", () => {
  it("uses tokenized, dark-safe styling for input controls", () => {
    render(
      <div>
        <Input aria-label="Name" placeholder="Name" />
        <Textarea aria-label="Notes" placeholder="Notes" />
        <NativeSelect aria-label="Status" defaultValue="">
          <option value="" disabled>Select status</option>
          <option value="yes">Yes</option>
        </NativeSelect>
      </div>
    );

    const input = screen.getByRole("textbox", { name: "Name" });
    const textarea = screen.getByRole("textbox", { name: "Notes" });
    const select = screen.getByRole("combobox", { name: "Status" });

    for (const element of [input, textarea, select]) {
      expect(element).toHaveClass("border-input");
      expect(element).toHaveClass("bg-background");
      expect(element).toHaveClass("text-foreground");
    }

    expect(input).toHaveClass("placeholder:text-muted-foreground");
    expect(textarea).toHaveClass("placeholder:text-muted-foreground");
    expect(select).toHaveClass("[color-scheme:light]");
    expect(select).toHaveClass("dark:[color-scheme:dark]");
  });
});
