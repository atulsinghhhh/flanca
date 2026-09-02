"use client";

/**
 * The last resort: an error in the root layout itself, where the app's own shell
 * and stylesheet may not have loaded. It therefore carries its own markup and
 * inline styles, and assumes nothing.
 */
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#faf8f4",
          color: "#16191d",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          padding: "24px",
        }}
      >
        <div style={{ maxWidth: "30rem" }}>
          <p style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.09em", textTransform: "uppercase", color: "#6b7480" }}>
            Flanca
          </p>
          <h1 style={{ margin: "12px 0 0", fontSize: "26px", lineHeight: 1.2 }}>The app could not start.</h1>
          <p style={{ marginTop: "14px", fontSize: "15px", lineHeight: 1.6, color: "#3f464e" }}>
            Nothing you had saved is affected. Reload the page; if it still will not start, the school&rsquo;s
            data is untouched and we can restore this in minutes.
          </p>
          <a
            href="/app"
            style={{
              display: "inline-block",
              marginTop: "22px",
              background: "#0f3a2c",
              color: "#fff",
              padding: "11px 20px",
              borderRadius: "7px",
              fontSize: "15px",
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Reload
          </a>
          {error.digest ? (
            <p style={{ marginTop: "22px", fontSize: "12px", color: "#6b7480" }}>Reference {error.digest}</p>
          ) : null}
        </div>
      </body>
    </html>
  );
}
