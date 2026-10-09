import Image from "next/image";
import { appBrand } from "@/lib/app-brand";

export function AppLogo({
  large = false,
  decorative = false,
}: {
  large?: boolean;
  decorative?: boolean;
}) {
  return (
    <Image
      src={appBrand.logo}
      alt={decorative ? "" : appBrand.alt}
      width={192}
      height={192}
      sizes={large ? "(max-width: 640px) 88px, 112px" : "56px"}
      loading="eager"
      className={`app-logo${large ? " app-logo--large" : ""}`}
    />
  );
}
