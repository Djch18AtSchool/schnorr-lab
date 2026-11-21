/** Dispositivo con el color y el ícono de su actor, como los chips del Escenario. */
import { Headset, Laptop, MonitorSmartphone, Smartphone, type LucideIcon } from "lucide-react";
import { deviceInfo, type ActorKey } from "../lib/devices";

const ICONS: Readonly<Record<ActorKey, LucideIcon>> = { ana: Smartphone, eve: Laptop, support: Headset, other: MonitorSmartphone };

interface DeviceChipProps {
  device: string;
  /** Texto adicional en gris (IP, número de peticiones…). */
  detail?: string;
  /** Solo el ícono y el nombre corto, para filas densas. */
  compact?: boolean;
}

export function DeviceChip({ device, detail, compact }: DeviceChipProps) {
  const info = deviceInfo(device);
  const Icon = ICONS[info.actor];
  return (
    <span className={`dev${compact ? " compact" : ""}`} data-a={info.actor} title={detail ? `${info.label} · ${detail}` : info.label}>
      <Icon aria-hidden="true" />
      <span className="dev-name">{info.label}</span>
      {detail ? <span className="dev-detail">{detail}</span> : null}
    </span>
  );
}
