# The frozen POC — do not rebuild this directory

G13. This is a byte-for-byte copy of the application as it stood when the
visual proof-of-concept was accepted, taken AFTER the P0bis pass (map on the
left everywhere, the draggable seam, the density pass, the RTL template, the
sending centre).

It is served from `/poc/` and it is **never redeployed**. Vite copies
`public/` verbatim into `dist/`, so every later build carries this snapshot
along unchanged while `/` moves on. Rebuilding it would defeat the only thing
it is for: giving the field expert and the product owner a fixed thing to
point at while the real application changes underneath them.

If it ever has to be refreshed — a new freeze, not a fix — delete the whole
directory and copy a fresh `dist/` into it, never copy `dist/` on top of it:
after the first freeze `dist/` CONTAINS `poc/`, and copying it back would nest
a snapshot inside a snapshot.
