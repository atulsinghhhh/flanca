"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { BookPlus, Check, IndianRupee, Loader2, Send, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/core/money";
import { addBook, collectFine, issueBook, returnBook, searchBooksForIssue, searchBorrowers } from "./actions";

export function ReturnButton({ issueId, fine }: { issueId: string; fine: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      <button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await returnBook(issueId);
            setMessage(r.error ?? (r.fine ? `Fine ${formatMoney(r.fine)}` : "Returned"));
            if (!r.error) router.refresh();
          })
        }
        className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline disabled:opacity-50"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Undo2 className="size-3.5" />}
        Return
        {fine > 0 ? <span className="text-overdue">({formatMoney(fine)})</span> : null}
      </button>
      {message ? <span className="text-[11.5px] text-ink-3">{message}</span> : null}
    </div>
  );
}

export function CollectFineButton({ issueId, fine }: { issueId: string; fine: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <button
      disabled={pending}
      onClick={() =>
        start(async () => {
          await collectFine(issueId);
          router.refresh();
        })
      }
      className="inline-flex items-center gap-1 text-[13px] font-semibold text-brand hover:underline disabled:opacity-50"
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : <IndianRupee className="size-3.5" />}
      Collect {formatMoney(fine)}
    </button>
  );
}

type BookMatch = { id: string; title: string; author: string | null; accessionNo: string; availableCopies: number };
type BorrowerMatch = { id: string; name: string; sub: string };

export function IssueBook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [borrowerType, setBorrowerType] = useState<"student" | "staff">("student");

  const [bookQuery, setBookQuery] = useState("");
  const [bookResults, setBookResults] = useState<BookMatch[]>([]);
  const [book, setBook] = useState<BookMatch | null>(null);

  const [borrowerQuery, setBorrowerQuery] = useState("");
  const [borrowerResults, setBorrowerResults] = useState<BorrowerMatch[]>([]);
  const [borrower, setBorrower] = useState<BorrowerMatch | null>(null);

  useEffect(() => {
    if (book || !bookQuery.trim()) {
      setBookResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchBooksForIssue(bookQuery).then(setBookResults);
    }, 250);
    return () => clearTimeout(t);
  }, [bookQuery, book]);

  useEffect(() => {
    if (borrower || !borrowerQuery.trim()) {
      setBorrowerResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchBorrowers(borrowerType, borrowerQuery).then(setBorrowerResults);
    }, 250);
    return () => clearTimeout(t);
  }, [borrowerQuery, borrowerType, borrower]);

  function reset() {
    setBook(null);
    setBookQuery("");
    setBorrower(null);
    setBorrowerQuery("");
  }

  function submit() {
    if (!book || !borrower) return;
    setError(null);
    setDone(null);
    start(async () => {
      const r = await issueBook({ bookId: book.id, borrowerType, borrowerId: borrower.id });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`"${book.title}" issued to ${borrower.name}`);
      reset();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
        <Send className="size-4" /> Issue a book
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="relative">
          <label className="eyebrow text-ink-3 mb-1 block">Book</label>
          {book ? (
            <div className="flex h-9.5 items-center justify-between rounded-md border border-line-2 bg-paper-2 px-2.5 text-[13.5px]">
              <span className="truncate">{book.title}</span>
              <button
                type="button"
                onClick={() => setBook(null)}
                className="ml-2 shrink-0 text-[12px] font-semibold text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <input
              value={bookQuery}
              onChange={(e) => setBookQuery(e.target.value)}
              placeholder="Search title, author or accession no."
              className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          )}
          {!book && bookResults.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-line-2 bg-white shadow-md">
              {bookResults.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setBook(b);
                      setBookResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[13px] hover:bg-paper-2"
                  >
                    <span className="min-w-0 truncate">
                      {b.title}
                      <span className="text-ink-3"> · {b.accessionNo}</span>
                    </span>
                    <span className="shrink-0 text-[11.5px] text-good">{b.availableCopies} free</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="relative">
          <div className="mb-1 flex items-center justify-between">
            <label className="eyebrow text-ink-3">Issue to</label>
            <div className="flex gap-1">
              {(["student", "staff"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => {
                    setBorrowerType(k);
                    setBorrower(null);
                    setBorrowerQuery("");
                  }}
                  className={`rounded px-2 py-0.5 text-[11.5px] font-semibold capitalize ${
                    borrowerType === k ? "bg-brand text-white" : "bg-paper-2 text-ink-2"
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          {borrower ? (
            <div className="flex h-9.5 items-center justify-between rounded-md border border-line-2 bg-paper-2 px-2.5 text-[13.5px]">
              <span className="truncate">
                {borrower.name} <span className="text-ink-3">· {borrower.sub}</span>
              </span>
              <button
                type="button"
                onClick={() => setBorrower(null)}
                className="ml-2 shrink-0 text-[12px] font-semibold text-brand hover:underline"
              >
                Change
              </button>
            </div>
          ) : (
            <input
              value={borrowerQuery}
              onChange={(e) => setBorrowerQuery(e.target.value)}
              placeholder={`Search ${borrowerType} by name`}
              className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          )}
          {!borrower && borrowerResults.length > 0 ? (
            <ul className="absolute z-10 mt-1 w-full rounded-md border border-line-2 bg-white shadow-md">
              {borrowerResults.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setBorrower(b);
                      setBorrowerResults([]);
                    }}
                    className="flex w-full items-center justify-between gap-2 px-2.5 py-2 text-left text-[13px] hover:bg-paper-2"
                  >
                    <span className="min-w-0 truncate">{b.name}</span>
                    <span className="shrink-0 text-[11.5px] text-ink-3">{b.sub}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      {done ? <p className="text-[12.5px] text-good">{done}</p> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !book || !borrower}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          Issue book
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            reset();
            setOpen(false);
          }}
        >
          Close
        </Button>
      </div>
    </div>
  );
}

export function AddBook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [isbn, setIsbn] = useState("");
  const [category, setCategory] = useState("");
  const [copies, setCopies] = useState("1");
  const [shelf, setShelf] = useState("");

  function submit() {
    setError(null);
    setDone(null);
    start(async () => {
      const r = await addBook({
        title,
        author: author || undefined,
        isbn: isbn || undefined,
        category: category || undefined,
        copies: Number(copies) || 1,
        shelf: shelf || undefined,
      });
      if (r.error) {
        setError(r.error);
        return;
      }
      setDone(`Added as ${r.accessionNo}`);
      setTitle("");
      setAuthor("");
      setIsbn("");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button size="sm" onClick={() => setOpen(true)}>
        <BookPlus className="size-4" /> Add a book
      </Button>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label htmlFor="title" className="eyebrow text-ink-3 mb-1 block">
            Title
          </label>
          <input
            id="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>
        <div>
          <label htmlFor="author" className="eyebrow text-ink-3 mb-1 block">
            Author
          </label>
          <input
            id="author"
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>
        <div>
          <label htmlFor="isbn" className="eyebrow text-ink-3 mb-1 block">
            ISBN (checked)
          </label>
          <input
            id="isbn"
            value={isbn}
            onChange={(e) => setIsbn(e.target.value)}
            placeholder="978-0-306-40615-7"
            className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 font-mono text-[13px] outline-none focus:border-brand"
          />
        </div>
        <div>
          <label htmlFor="category" className="eyebrow text-ink-3 mb-1 block">
            Category
          </label>
          <input
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Fiction, Reference…"
            className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="copies" className="eyebrow text-ink-3 mb-1 block">
              Copies
            </label>
            <input
              id="copies"
              inputMode="numeric"
              value={copies}
              onChange={(e) => setCopies(e.target.value.replace(/\D/g, ""))}
              className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-right text-[14px] tnum outline-none focus:border-brand"
            />
          </div>
          <div>
            <label htmlFor="shelf" className="eyebrow text-ink-3 mb-1 block">
              Shelf
            </label>
            <input
              id="shelf"
              value={shelf}
              onChange={(e) => setShelf(e.target.value)}
              placeholder="B-4"
              className="h-9.5 w-full rounded-md border border-line-2 bg-white px-2.5 text-[14px] outline-none focus:border-brand"
            />
          </div>
        </div>
      </div>

      {error ? <p className="text-[12.5px] text-overdue">{error}</p> : null}
      {done ? <p className="text-[12.5px] text-good">{done}</p> : null}

      <div className="flex gap-2">
        <Button size="sm" onClick={submit} disabled={pending || !title.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
          Add to catalogue
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Close
        </Button>
      </div>
    </div>
  );
}
