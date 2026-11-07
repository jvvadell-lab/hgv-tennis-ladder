import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["192.168.0.151"],
  // La tarjeta de la invitación se adjunta embebida en el correo: la función
  // la lee del disco, así que tiene que viajar en su bundle.
  outputFileTracingIncludes: {
    "/api/admin/correos/**": ["./public/torneo/invitacion-inauguracion.jpg"],
    // Las piezas de difusión leen del disco sus fuentes y logos.
    "/api/publico/torneo/pieza": [
      "./assets/fuentes/*.ttf",
      "./public/logo-hgv.png",
      "./public/logo-comision-tenis.png",
      "./public/patrocinantes/png/*.png",
    ],
  },
};

export default nextConfig;