import React, { ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "outlined";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50";

    const variantStyles: Record<ButtonVariant, string> = {
      primary: "bg-primary text-primary-foreground hover:bg-primary/90",
      outlined: "border border-primary text-primary hover:bg-primary/10",
    };

    const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${className}`.trim();

    return (
      <button ref={ref} className={combinedClassName} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button, type ButtonVariant };
