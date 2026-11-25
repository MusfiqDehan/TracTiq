import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1B4332",
          borderRadius: 36,
        }}
      >
        <svg
          width="136"
          height="136"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M7 9.5H18"
            stroke="#F7F7F5"
            strokeWidth="3.1"
            strokeLinecap="round"
          />
          <path
            d="M12.5 9.5V22.5"
            stroke="#F7F7F5"
            strokeWidth="3.1"
            strokeLinecap="round"
          />
          <circle cx="23.75" cy="9.5" r="2.1" fill="#74C69D" />
          <path
            d="M17.25 18.5L20 21.25L25.25 15.25"
            stroke="#74C69D"
            strokeWidth="2.85"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
