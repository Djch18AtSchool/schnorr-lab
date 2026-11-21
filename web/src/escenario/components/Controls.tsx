/** Controles pequeños del drawer: selector segmentado e interruptor. */

export interface SegOption<T extends string | number> {
  value: T;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface SegProps<T extends string | number> {
  label: string;
  options: ReadonlyArray<SegOption<T>>;
  value: T;
  onChange: (value: T) => void;
}

export function Seg<T extends string | number>({ label, options, value, onChange }: SegProps<T>) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          className={option.value === value ? "sel" : undefined}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

interface SwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function Switch({ label, checked, onChange }: SwitchProps) {
  return (
    <div className="drow">
      <span>{label}</span>
      <button type="button" className="switch" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />
    </div>
  );
}
