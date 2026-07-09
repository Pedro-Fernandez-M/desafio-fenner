export function PageHeader({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground text-sm">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export function ComingSoon({ stage }: { stage: string }) {
  return (
    <div className="grid place-items-center rounded-xl border border-dashed bg-white py-20 text-center">
      <div className="space-y-1">
        <p className="font-medium">Módulo en construcción</p>
        <p className="text-muted-foreground text-sm">Se implementa en la {stage}.</p>
      </div>
    </div>
  )
}
