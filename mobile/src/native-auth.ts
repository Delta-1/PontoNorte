import { registerPlugin } from "@capacitor/core";

type AuthenticateOptions = {
  title: string;
  subtitle?: string;
};

type Availability = {
  available: boolean;
};

interface DeviceAuthPlugin {
  authenticate(options: AuthenticateOptions): Promise<void>;
  isAvailable(): Promise<Availability>;
}

export const DeviceAuth = registerPlugin<DeviceAuthPlugin>("DeviceAuth");
