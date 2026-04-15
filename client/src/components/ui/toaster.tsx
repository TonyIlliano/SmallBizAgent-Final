import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      <div aria-live="polite" aria-atomic="true" role="status">
        {toasts.map(function ({ id, title, description, action, ...props }) {
          const isError = props.variant === "destructive";
          return (
            <Toast key={id} {...props}>
              <div className="grid gap-1" aria-live={isError ? "assertive" : "polite"} role={isError ? "alert" : "status"}>
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                  <ToastDescription>{description}</ToastDescription>
                )}
              </div>
              {action}
              <ToastClose aria-label="Close notification" />
            </Toast>
          )
        })}
      </div>
      <ToastViewport />
    </ToastProvider>
  )
}
