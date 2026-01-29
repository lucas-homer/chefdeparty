import React, { ButtonHTMLAttributes, forwardRef } from "react";

type IconButtonVariant = "ghost" | "outlined";

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: IconButtonVariant;
}

const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ variant = "ghost", className = "", children, ...props }, ref) => {
    const baseStyles = "inline-flex items-center justify-center p-1.5 rounded transition-colors disabled:opacity-50";

    const variantStyles: Record<IconButtonVariant, string> = {
      ghost: "text-muted-foreground hover:text-destructive",
      outlined: "border border-muted-foreground text-muted-foreground hover:border-destructive hover:text-destructive",
    };

    const combinedClassName = `${baseStyles} ${variantStyles[variant]} ${className}`.trim();

    return (
      <button ref={ref} className={combinedClassName} {...props}>
        {children}
      </button>
    );
  }
);

IconButton.displayName = "IconButton";

export { IconButton, type IconButtonVariant };
