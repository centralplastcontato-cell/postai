// Categorias do banco de fotos reais. Módulo NORMAL (não "use server") porque um
// arquivo de Server Actions só pode exportar funções async — constantes/tipos têm
// que ficar fora dele pra poderem ser importadas no cliente.

export const CATEGORIAS = ["espaco", "brinquedos", "festa", "comida", "geral"] as const;
export type CategoriaImagem = (typeof CATEGORIAS)[number];
