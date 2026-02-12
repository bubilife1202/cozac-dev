import { ImageResponse } from "next/og";

export async function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          position: "relative",
          fontFamily: "Geist, Inter, sans-serif",
          background:
            "radial-gradient(circle at 15% 20%, #3b82f6 0%, #111827 35%, #020617 100%)",
          padding: "56px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "18px",
          }}
        >
          <span
            style={{
              color: "#93c5fd",
              fontSize: "28px",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
            }}
          >
            cozac.dev
          </span>
          <span
            style={{
              color: "white",
              fontSize: "68px",
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: "-0.03em",
              maxWidth: "1000px",
            }}
          >
            Jinbae Park
          </span>
          <span
            style={{
              color: "#bfdbfe",
              fontSize: "34px",
              fontWeight: 500,
              maxWidth: "980px",
            }}
          >
            Interactive portfolio with macOS desktop and iOS mobile experiences
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            gap: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "14px 22px",
              borderRadius: "999px",
              backgroundColor: "rgba(15, 23, 42, 0.58)",
              border: "1px solid rgba(148, 163, 184, 0.38)",
            }}
          >
            <span style={{ color: "#93c5fd", fontSize: "24px" }}>M5</span>
            <span style={{ color: "#cbd5e1", fontSize: "24px" }}>2025</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <div
              style={{
                width: "22px",
                height: "22px",
                borderRadius: "999px",
                display: "flex",
                backgroundColor: "#22c55e",
                justifyContent: "center",
                alignItems: "center",
              }}
            />
            <span style={{ color: "#cbd5e1", fontSize: "26px", fontWeight: 500 }}>
              Virtual Office for Nomads
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
