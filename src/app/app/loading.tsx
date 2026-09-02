/**
 * What a school sees while a page is being fetched.
 *
 * This matters more here than in most products: the office works on a connection
 * that drops to 3G at four in the afternoon, and the overview alone runs fifteen
 * queries. Without a boundary, Next holds the previous screen with no feedback at
 * all, and a clerk taps the link again — which is how you get two receipts.
 *
 * The shape deliberately echoes the real pages (a heading, a row of numbers, a
 * table) so the layout does not jump when the data lands.
 */
export default function Loading() {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>

      <div className="animate-pulse">
        <div className="h-3 w-24 rounded bg-paper-2" />
        <div className="mt-3 h-8 w-64 rounded bg-paper-2" />
        <div className="mt-3 h-3.5 w-full max-w-md rounded bg-paper-2" />

        <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card p-4">
              <div className="h-2.5 w-20 rounded bg-paper-2" />
              <div className="mt-3 h-7 w-24 rounded bg-paper-2" />
              <div className="mt-2.5 h-2.5 w-28 rounded bg-paper-2" />
            </div>
          ))}
        </div>

        <div className="mt-5 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
          <div className="card">
            <div className="border-b border-line px-5 py-3.5">
              <div className="h-3.5 w-40 rounded bg-paper-2" />
            </div>
            <div className="divide-y divide-line">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center gap-3 px-5 py-3.5">
                  <div className="h-3.5 flex-1 rounded bg-paper-2" />
                  <div className="h-3.5 w-16 rounded bg-paper-2" />
                </div>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="border-b border-line px-5 py-3.5">
              <div className="h-3.5 w-28 rounded bg-paper-2" />
            </div>
            <div className="space-y-3 px-5 py-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-3.5 rounded bg-paper-2" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
