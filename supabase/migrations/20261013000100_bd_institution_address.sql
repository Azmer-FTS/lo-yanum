-- ★★ BD 1 (2026-10-12) — UNE INSTITUTION EST UN LIEU : SON ADRESSE.
--
-- Additive, appliquée AVANT le déploiement du code (qui écrit `address`).
-- L'adresse PROPOSE un point sur la fiche (`proposePointForAddress`), que le
-- PO valide ou corrige ; elle reprendra l'ancienne « כתובת המזכירות » de BB
-- (`office_address`) dans la migration suivante. Rien pour `anon` : la table
-- reste fermée (20260925000300).
alter table public.institutions add column if not exists address text not null default '';
