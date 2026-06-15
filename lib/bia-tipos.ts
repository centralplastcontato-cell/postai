// Tipo compartilhado entre a server action (app/actions/bia.ts) e o chat (components/chat-bia.tsx).
// Fica fora do arquivo "use server" porque esse só pode exportar funções async.
export type MsgBia = { de: "user" | "bia"; texto: string };
