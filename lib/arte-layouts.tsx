// Layouts completos (canvas 1080x1350) por template, reaproveitados pelo route de
// produção e pela rota de preview. Cada função recebe os dados já prontos e
// devolve o JSX para o ImageResponse.
import { Confete, OndaBase, TituloMulticolor, CtaWhatsApp, LogoSolto, escolherFundoFesta, contorno, corContraste, luminancia, svgDataUri, BRANCO, PRETO } from "@/lib/arte";

export type DadosArte = {
  paleta: string[];
  logoSrc: string;
  site: string;
  telefone: string;
  titulo: { t: string; c: string }[];
  textoApoio?: string;
  oferta?: string; // selo grande (ex: "10 CRIANÇAS GRÁTIS")
  validade?: string; // ex: "Válido até 15/02"
  inclui?: string[]; // lista "o que está incluso" (ex: 2h de salão, monitor...)
  regras?: string; // letras miúdas / condições (ex: seg a qui, mediante reserva)
  diferenciais?: string[]; // pontos fortes "por que escolher" (institucional)
  selo?: string; // pílula curta destacada (ex: a data: "25 de Dezembro")
  corFundo?: string; // cor de fundo (default: azul da paleta)
};

// Dá contexto à validade: se for uma DATA pura (ex: "30/06/2026", "30/06"),
// prefixa "Válido até" — senão (ex: "Datas de julho", "Enquanto durar") deixa igual.
export function rotularValidade(v?: string): string {
  const s = (v || "").trim();
  if (!s) return "";
  return /^\d{1,2}[/.\-]\d{1,2}([/.\-]\d{2,4})?$/.test(s) ? `Válido até ${s}` : s;
}

// Converte cor hex (#RGB ou #RRGGBB) pra rgba com alpha — pro véu de cor sobre a foto de fundo.
function hexParaRgba(hex: string, a: number): string {
  const h = (hex || "").replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16) || 0;
  const g = parseInt(n.slice(2, 4), 16) || 0;
  const b = parseInt(n.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

// Foto de fundo OPCIONAL pros templates de texto (Promoção, Preço, Divulgação): a foto entra
// COVER + um véu da cor da marca por cima — mantém a identidade E a legibilidade do texto branco.
// Renderizada ANTES do conteúdo no DOM (fica atrás dele).
function FundoFoto({ src, cor, w = 1080, h = 1350 }: { src: string; cor: string; w?: number; h?: number }) {
  const cobre = { position: "absolute" as const, top: 0, left: 0, width: `${w}px`, height: `${h}px` };
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} width={w} height={h} style={{ ...cobre, objectFit: "cover" }} />
      <div style={{ ...cobre, display: "flex", backgroundColor: hexParaRgba(cor, 0.64) }} />
      <div style={{ ...cobre, display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0) 26%, rgba(0,0,0,0) 66%, rgba(0,0,0,0.55))" }} />
    </>
  );
}

// 🎉 Promoção / Oferta — fundo colorido festa + selo + CTA WhatsApp (foto de fundo opcional).
export function LayoutPromocao(d: DadosArte & { imagemUrl?: string }) {
  const [c1, c2, c3, c4, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[3] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || c4;
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 36%, rgba(255,255,255,0.26), rgba(0,0,0,0.14) 70%)",
        fontFamily: "Baloo",
      }}
    >
      {d.imagemUrl ? <FundoFoto src={d.imagemUrl} cor={fundo} /> : null}
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      {(() => {
        const itens = (d.inclui || []).filter((s) => s && s.trim()).slice(0, 5);
        const temLista = itens.length > 0;
        const rodape = [rotularValidade(d.validade), d.regras].filter((s) => s && s.trim()).join("  ·  ");
        // Fonte do título: começa grande e REDUZ até a linha mais LONGA caber numa linha só.
        // Antes olhava só a CONTAGEM de linhas (d.titulo.length) — um título de 2 linhas mas
        // LONGAS (ex: "FESTA INESQUECÍVEL / COM DESCONTO!") ficava com fonte 112, quebrava em
        // 4 linhas VISUAIS e o CTA estourava a onda (top 1110). Agora conta o COMPRIMENTO real.
        const cabe = (f: number) => Math.floor(920 / (f * 0.58)); // chars/linha nessa fonte (920 = 1080 - padding)
        const maxLen = Math.max(1, ...d.titulo.map((l) => (l.t || "").length));
        const fonteTitulo = [112, 100, 90, 82, 74].find((f) => maxLen <= cabe(f)) ?? 74;
        const chMax = cabe(fonteTitulo);
        const nLinhas = d.titulo.reduce((acc, l) => acc + Math.max(1, Math.ceil((l.t || "").length / chMax)), 0);
        const margemTopo = Math.max(120, (nLinhas >= 4 ? 200 : nLinhas === 3 ? 270 : 350) - (temLista ? 50 : 0) - itens.length * 12);
        return (
          <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", marginTop: margemTopo, flexGrow: 1 }}>
            <TituloMulticolor linhas={d.titulo} fontSize={fonteTitulo} fundo={fundo} />

            {d.oferta ? (
              <div style={{ display: "flex", marginTop: 30 }}>
                <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 56, color: PRETO, backgroundColor: c3, padding: "16px 34px", borderRadius: 18, transform: "rotate(-2deg)", boxShadow: "0 8px 0 rgba(0,0,0,0.2)" }}>
                  {d.oferta}
                </div>
              </div>
            ) : null}

            {temLista ? (
              <div style={{ display: "flex", flexDirection: "column", marginTop: 30 }}>
                {itens.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 0 : 16 }}>
                    <div style={{ display: "flex", width: 18, height: 18, borderRadius: 6, backgroundColor: c2, marginRight: 18, transform: "rotate(8deg)" }} />
                    <div style={{ display: "flex", fontSize: 38, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.45)" }}>{item}</div>
                  </div>
                ))}
              </div>
            ) : d.textoApoio ? (
              <div style={{ display: "flex", marginTop: 26, fontSize: 42, color: BRANCO, lineHeight: 1.25, textShadow: "0 2px 6px rgba(0,0,0,0.45)", maxWidth: 840 }}>
                {d.textoApoio}
              </div>
            ) : null}

            <div style={{ display: "flex", marginTop: 40 }}>
              {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
            </div>

            {rodape ? (
              <div style={{ display: "flex", marginTop: 20, fontSize: 26, color: "rgba(255,255,255,0.9)", fontFamily: "Fredoka", textShadow: "0 2px 4px rgba(0,0,0,0.4)", maxWidth: 880, lineHeight: 1.2 }}>
                {rodape}
              </div>
            ) : null}
          </div>
        );
      })()}

      <OndaBase cor={c1} />
      <div style={{ position: "absolute", bottom: 60, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
        {d.site}
      </div>
    </div>
  );
}

// 🟣 STORY (1080x1920, 9:16) — vertical tela cheia pro Story do Instagram. Fundo:
// foto real (com degradê pra leitura) OU cor festiva + confete. Título grande,
// oferta opcional, validade, CTA WhatsApp e site no rodapé. Mesmos helpers do feed.
export function LayoutStory(d: DadosArte & { imagemUrl?: string; variante?: string }) {
  const [c1, c2, c3, , c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[3] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || d.paleta[3] || d.paleta[0];
  const temFoto = Boolean(d.imagemUrl);
  const nLinhas = d.titulo.length;
  const fonteTitulo = nLinhas >= 4 ? 100 : nLinhas === 3 ? 116 : 132;

  // Variante FAIXA: foto de fundo + faixa diagonal com o título (estilo do feed Faixa).
  if (temFoto && d.variante === "faixa") {
    const fFaixa = nLinhas >= 3 ? 78 : nLinhas === 2 ? 98 : 120;
    return (
      <div style={{ width: "1080px", height: "1920px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.imagemUrl} width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1920px", objectFit: "cover" }} />
        <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1920px", display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.30), rgba(0,0,0,0.05) 38%, rgba(0,0,0,0.6))" }} />
        {d.logoSrc ? <LogoSolto src={d.logoSrc} top={150} right={80} h={130} /> : null}
        {/* faixa diagonal com o título */}
        <div style={{ position: "absolute", top: 760, left: -90, width: 1260, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "56px 40px", backgroundColor: c1, transform: "rotate(-8deg)", boxShadow: "0 14px 0 rgba(0,0,0,0.22)" }}>
          {d.titulo.map((l, i) => (
            <div key={i} style={{ display: "flex", fontSize: fFaixa, color: corContraste(BRANCO, c1), fontFamily: "Fredoka", textShadow: contorno(), lineHeight: 1.02, letterSpacing: 1 }}>{l.t}</div>
          ))}
        </div>
        {/* CTA + site embaixo */}
        <div style={{ position: "absolute", bottom: 130, left: 0, width: "1080px", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
          <div style={{ display: "flex", marginTop: 22, fontFamily: "Fredoka", fontSize: 34, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{d.site}</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ width: "1080px", height: "1920px", display: "flex", flexDirection: "column", position: "relative", backgroundColor: fundo, ...(temFoto ? {} : { backgroundImage: "radial-gradient(circle at 50% 28%, rgba(255,255,255,0.22), rgba(0,0,0,0.18) 72%)" }), fontFamily: "Baloo" }}>
      {temFoto ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.imagemUrl} width={1080} height={1920} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1920px", objectFit: "cover" }} />
          <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1920px", display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.30) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0.35) 58%, rgba(0,0,0,0.85) 100%)" }} />
        </>
      ) : (
        <Confete cores={[c2, c3, c5, c1]} />
      )}

      {d.logoSrc ? <LogoSolto src={d.logoSrc} top={150} right={80} h={130} /> : null}

      <div style={{ display: "flex", flexDirection: "column", padding: "0 90px", marginTop: temFoto ? 1000 : 720, flexGrow: 1 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={fonteTitulo} fundo={temFoto ? PRETO : fundo} />

        {d.oferta ? (
          <div style={{ display: "flex", marginTop: 38 }}>
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 62, color: PRETO, backgroundColor: c3, padding: "20px 40px", borderRadius: 22, transform: "rotate(-2deg)", boxShadow: "0 8px 0 rgba(0,0,0,0.2)" }}>
              {d.oferta}
            </div>
          </div>
        ) : d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 30, fontSize: 50, color: BRANCO, lineHeight: 1.25, textShadow: "0 2px 10px rgba(0,0,0,0.6)", maxWidth: 880 }}>
            {d.textoApoio}
          </div>
        ) : null}

        {d.validade ? (
          <div style={{ display: "flex", marginTop: 24, fontSize: 36, color: "rgba(255,255,255,0.92)", fontFamily: "Fredoka", textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
            {rotularValidade(d.validade)}
          </div>
        ) : null}

        <div style={{ display: "flex", marginTop: 50 }}>
          {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
        </div>
      </div>

      {temFoto ? null : <OndaBase cor={c1} top={1700} />}
      <div style={{ position: "absolute", bottom: 78, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 34, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>
        {d.site}
      </div>
    </div>
  );
}

// 💡 Dica / Conteúdo — foto de IA de fundo (ou cor sólida) + texto ancorado embaixo.
export function LayoutFoto(d: DadosArte & { imagemUrl?: string }) {
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const sombra = "0 2px 12px rgba(0,0,0,0.6)";
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1080px",
          height: "1350px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "80px",
          backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 24%, rgba(0,0,0,0) 42%, rgba(0,0,0,0.72) 76%, rgba(0,0,0,0.94) 100%)",
        }}
      >
        {d.logoSrc ? (
          <div style={{ display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.logoSrc} width={Math.round(70 * 1.76)} height={70} style={{ objectFit: "contain" }} />
          </div>
        ) : <div style={{ display: "flex" }} />}

        <div style={{ display: "flex", flexDirection: "column" }}>
          <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 72 : 84} />
          {d.textoApoio ? (
            <div style={{ display: "flex", marginTop: 22, fontSize: 38, color: "rgba(255,255,255,0.9)", lineHeight: 1.3, textShadow: sombra }}>{d.textoApoio}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 40, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.25)" }}>
            <span style={{ display: "flex", fontFamily: "Fredoka", fontSize: 28, color: "rgba(255,255,255,0.85)" }}>{d.site}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// 🎄 Data Comemorativa — saudação temática GRANDE centralizada sobre foto de IA,
// com selo da data, confete festivo e logo no topo. Tom de celebração.
export function LayoutDataComemorativa(d: DadosArte & { imagemUrl?: string }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const logoW = Math.round(96 * 1.76);
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
      ) : null}

      {/* Vinheta: escurece topo e base pra leitura, deixa o miolo respirando a foto */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1080px",
          height: "1350px",
          display: "flex",
          backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.12) 26%, rgba(0,0,0,0.12) 60%, rgba(0,0,0,0.78) 100%)",
        }}
      />

      <Confete cores={[c2, c3, c5, c1]} />

      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1080px",
          height: "1350px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "96px 80px",
        }}
      >
        {/* Logo no topo (só quando NÃO há ilustração de fundo — senão cai em cima do personagem;
            com ilustração o logo vai pro rodapé). */}
        {d.logoSrc && !d.imagemUrl ? (
          <div style={{ display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.logoSrc} width={logoW} height={96} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
          </div>
        ) : <div style={{ display: "flex" }} />}

        {/* Saudação grande centralizada + selo + apoio — sobre um painel escuro suave pra o texto
            ficar LEGÍVEL e separado do desenho (não "solto" em cima da ilustração). */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", backgroundColor: d.imagemUrl ? "rgba(8,6,14,0.5)" : "transparent", borderRadius: 44, padding: d.imagemUrl ? "40px 52px" : "0", boxShadow: d.imagemUrl ? "0 18px 60px rgba(0,0,0,0.4)" : "none", maxWidth: 940 }}>
          {d.selo ? (
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 38, color: PRETO, backgroundColor: c3, padding: "10px 30px", borderRadius: 999, marginBottom: 30, transform: "rotate(-2deg)", boxShadow: "0 6px 0 rgba(0,0,0,0.22)" }}>
              {d.selo}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Kaushan" }}>
            {d.titulo.map((l, i) => (
              <div key={i} style={{ display: "flex", fontSize: d.titulo.length >= 3 ? 112 : 138, color: corContraste(l.c, d.imagemUrl ? undefined : fundo), lineHeight: 1.14, textShadow: contorno(), letterSpacing: 0, textAlign: "center" }}>
                {l.t}
              </div>
            ))}
          </div>

          {d.textoApoio ? (
            <div style={{ display: "flex", marginTop: 30, fontSize: 40, color: "rgba(255,255,255,0.95)", lineHeight: 1.28, textShadow: "0 2px 10px rgba(0,0,0,0.7)", maxWidth: 820, textAlign: "center" }}>
              {d.textoApoio}
            </div>
          ) : null}
        </div>

        {/* Rodapé: logo (quando há ilustração) + WhatsApp + site */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {d.logoSrc && d.imagemUrl ? (
            <div style={{ display: "flex", marginBottom: 26 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={d.logoSrc} width={Math.round(logoW * 0.85)} height={82} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.7))" }} />
            </div>
          ) : null}
          {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
          <div style={{ display: "flex", marginTop: d.telefone ? 22 : 0, fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
            {d.site}
          </div>
        </div>
      </div>
    </div>
  );
}

// ⭐ Divulgação / Institucional — fundo colorido festa + "por que escolher" com
// os diferenciais em destaque (lista com checks) + CTA WhatsApp.
export function LayoutDivulgacao(d: DadosArte & { parcelamento?: string; imagemUrl?: string }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const itens = (d.diferenciais || []).filter((s) => s && s.trim()).slice(0, 4);
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 32%, rgba(255,255,255,0.24), rgba(0,0,0,0.16) 72%)",
        fontFamily: "Baloo",
      }}
    >
      {d.imagemUrl ? <FundoFoto src={d.imagemUrl} cor={fundo} /> : null}
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", marginTop: 300, flexGrow: 1 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 92 : 108} fundo={fundo} />

        {d.textoApoio && itens.length === 0 ? (
          <div style={{ display: "flex", marginTop: 26, fontSize: 42, color: BRANCO, lineHeight: 1.25, textShadow: "0 2px 6px rgba(0,0,0,0.45)", maxWidth: 840 }}>
            {d.textoApoio}
          </div>
        ) : null}

        {itens.length ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 36 }}>
            {itens.map((item, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", marginTop: i === 0 ? 0 : 22 }}>
                <div style={{ display: "flex", width: 44, height: 44, borderRadius: 999, backgroundColor: c3, alignItems: "center", justifyContent: "center", marginRight: 24, boxShadow: "0 4px 0 rgba(0,0,0,0.2)" }}>
                  <div style={{ display: "flex", width: 16, height: 16, borderRadius: 5, backgroundColor: PRETO, transform: "rotate(8deg)" }} />
                </div>
                <div style={{ display: "flex", fontSize: 44, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.45)" }}>{item}</div>
              </div>
            ))}
          </div>
        ) : null}

        {d.parcelamento ? (
          <div style={{ display: "flex", marginTop: 34 }}>
            <div style={{ display: "flex", alignItems: "center", fontFamily: "Fredoka", fontSize: 46, color: PRETO, backgroundColor: c3, padding: "14px 36px", borderRadius: 999, transform: "rotate(-2deg)", boxShadow: "0 8px 0 rgba(0,0,0,0.2)" }}>💳 {d.parcelamento}</div>
          </div>
        ) : null}

        <div style={{ display: "flex", marginTop: 40 }}>
          {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
        </div>
      </div>

      <OndaBase cor={c1} />
      <div style={{ position: "absolute", bottom: 60, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
        {d.site}
      </div>
    </div>
  );
}

// 🎂 Aniversariantes da Semana — CAPA do carrossel festivo (fundo colorido + confete).
export function LayoutAnivCapa(d: DadosArte) {
  const [c1, c2, c3, c4, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[3] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || c4;
  const logoW = Math.round(96 * 1.76);
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 34%, rgba(255,255,255,0.24), rgba(0,0,0,0.16) 72%)",
        fontFamily: "Baloo",
        padding: "96px 70px",
      }}
    >
      <Confete cores={[c2, c3, c5, c1]} />

      {d.logoSrc ? (
        <div style={{ display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.logoSrc} width={logoW} height={96} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
        </div>
      ) : <div style={{ display: "flex" }} />}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 104 : 120} fundo={fundo} />
        {d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 28, fontFamily: "Fredoka", fontSize: 42, color: PRETO, backgroundColor: c3, padding: "12px 38px", borderRadius: 999, transform: "rotate(-2deg)", boxShadow: "0 6px 0 rgba(0,0,0,0.22)" }}>
            {d.textoApoio}
          </div>
        ) : null}
      </div>

      <div style={{ display: "flex", alignItems: "center", fontFamily: "Fredoka", fontSize: 34, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
        {d.site}{d.site ? "   ·   " : ""}arraste →
      </div>
    </div>
  );
}

// 🎂 Aniversariantes da Semana — CARD de um aniversariante (foto + nome + idade).
export function LayoutAnivCard(d: DadosArte & { nome?: string; idade?: string; fotoUrl?: string; recado?: string }) {
  const [c1, c2, c3, c4, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[3] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || c4;
  const logoW = Math.round(72 * 1.76);
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.22), rgba(0,0,0,0.16) 72%)",
        fontFamily: "Baloo",
        padding: "70px 60px",
      }}
    >
      <Confete cores={[c2, c3, c5, c1]} />

      {d.logoSrc ? (
        <div style={{ display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.logoSrc} width={logoW} height={72} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
        </div>
      ) : <div style={{ display: "flex", height: 72 }} />}

      {/* Foto do aniversariante num quadro arredondado com borda colorida */}
      <div style={{ display: "flex", marginTop: 46, width: 640, height: 640, borderRadius: 50, overflow: "hidden", border: `14px solid ${c3}`, boxShadow: "0 14px 0 rgba(0,0,0,0.18)" }}>
        {d.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.fotoUrl} width={640} height={640} style={{ width: "640px", height: "640px", objectFit: "cover" }} />
        ) : (
          <div style={{ display: "flex", width: "640px", height: "640px", backgroundColor: "rgba(0,0,0,0.25)" }} />
        )}
      </div>

      {/* Nome */}
      <div style={{ display: "flex", marginTop: 44, fontFamily: "Fredoka", fontSize: 96, color: BRANCO, textShadow: contorno(), letterSpacing: 1, textAlign: "center" }}>
        {d.nome}
      </div>

      {/* Idade (selo) */}
      {d.idade ? (
        <div style={{ display: "flex", marginTop: 20, fontFamily: "Fredoka", fontSize: 48, color: PRETO, backgroundColor: c2, padding: "12px 40px", borderRadius: 999, transform: "rotate(-2deg)", boxShadow: "0 6px 0 rgba(0,0,0,0.22)" }}>
          {d.idade}
        </div>
      ) : null}

      {/* Recado opcional pra criança (ex: "Parabéns, princesa!") */}
      {d.recado ? (
        <div style={{ display: "flex", marginTop: 24, maxWidth: 880, textAlign: "center", fontFamily: "Fredoka", fontSize: 42, color: BRANCO, lineHeight: 1.25, textShadow: "0 2px 6px rgba(0,0,0,0.55)" }}>
          {d.recado}
        </div>
      ) : null}

      <div style={{ display: "flex", flexGrow: 1 }} />
      <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 28, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>{d.site}</div>
    </div>
  );
}

// 🖼️ Mosaico de Fotos Reais — CAPA de carrossel que mostra o ESPAÇO DE VERDADE
// (fotos do banco em círculos sobrepostos), com título multicolor, selo de oferta
// tipo carimbo e CTA. Inspirado nas capas de buffet que vendem mostrando o lugar
// real (não IA). Usa até 4 fotos; com menos, usa os círculos maiores.
export function LayoutMosaico(d: DadosArte & { fotos?: string[]; arraste?: boolean }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const fotos = (d.fotos || []).filter(Boolean).slice(0, 4);
  const logoW = Math.round(80 * 1.76);
  // Fonte do selo encolhe conforme o texto cresce, pra não cortar dentro do círculo.
  const ofLen = (d.oferta || "").length;
  const ofFont = ofLen > 30 ? 33 : ofLen > 18 ? 39 : 46;
  // Círculos das fotos (maior primeiro): coluna à direita estilo capa de buffet.
  const slots = [
    { size: 400, top: 60, left: 600 },
    { size: 330, top: 430, left: 480 },
    { size: 360, top: 720, left: 640 },
    { size: 280, top: 1010, left: 700 },
  ];
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 28% 30%, rgba(255,255,255,0.22), rgba(0,0,0,0.18) 72%)",
        fontFamily: "Baloo",
      }}
    >
      <Confete cores={[c2, c3, c5, c1]} />

      {/* Fotos reais em círculos emoldurados. O borderRadius vai DIRETO na <img>:
          no Satori (next/og) o overflow:hidden de um <div> pai NÃO recorta a img
          em círculo — os cantos quadrados vazam. Borda branca também na própria img. */}
      {fotos.map((src, i) => {
        const s = slots[i];
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            width={s.size}
            height={s.size}
            style={{ position: "absolute", top: s.top, left: s.left, width: `${s.size}px`, height: `${s.size}px`, objectFit: "cover", borderRadius: 9999, border: "12px solid #fff", boxShadow: "0 12px 30px rgba(0,0,0,0.35)" }}
          />
        );
      })}

      {/* Logo no topo-esquerda */}
      {d.logoSrc ? (
        <div style={{ position: "absolute", top: 70, left: 64, display: "flex" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.logoSrc} width={logoW} height={80} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
        </div>
      ) : null}

      {/* Título multicolor (canto superior esquerdo) */}
      <div style={{ position: "absolute", top: 200, left: 64, display: "flex", flexDirection: "column", maxWidth: 480 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 64 : 84} fundo={fundo} />
      </div>

      {/* Selo de oferta (carimbo circular) — só quando há oferta */}
      {d.oferta ? (
        <div style={{ position: "absolute", top: 650, left: 56, width: 310, height: 310, borderRadius: 9999, backgroundColor: "#fff", border: `6px solid ${c1}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(-7deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.3)", padding: 42 }}>
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: ofFont, color: c1, textAlign: "center", lineHeight: 1.05 }}>{d.oferta}</div>
          {d.validade ? <div style={{ display: "flex", marginTop: 12, fontFamily: "Fredoka", fontSize: 22, color: PRETO, textAlign: "center", lineHeight: 1.1 }}>{d.validade}</div> : null}
        </div>
      ) : null}

      {/* Rodapé: CTA WhatsApp + site + "arraste" */}
      <div style={{ position: "absolute", bottom: 60, left: 64, display: "flex", flexDirection: "column" }}>
        {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
        {d.site || d.arraste ? (
          <div style={{ display: "flex", marginTop: 18, fontFamily: "Fredoka", fontSize: 28, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>
            {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// 🎨 Capa de carrossel COLORIDA FESTIVA — fundo de cor vibrante, título multicolor
// centralizado, confete e logo. SEM foto. Limpa, chamativa, com "arraste →".
export function LayoutCapaFestiva(d: DadosArte & { arraste?: boolean }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.26), rgba(0,0,0,0.18) 72%)",
        fontFamily: "Baloo",
      }}
    >
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 80px", flexGrow: 1 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 104 : 124} fundo={fundo} />
        {d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 30, maxWidth: 880, fontSize: 44, color: BRANCO, lineHeight: 1.25, textAlign: "center", textShadow: "0 2px 6px rgba(0,0,0,0.45)" }}>
            {d.textoApoio}
          </div>
        ) : null}
      </div>

      <OndaBase cor={c1} />
      <div style={{ position: "absolute", bottom: 58, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
        {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
      </div>
    </div>
  );
}

// 📸 Capa FOTO EM DESTAQUE — foto real cobrindo a capa, gradiente pra leitura, título
// multicolor por cima. Impactante e mostra o espaço de verdade.
export function LayoutCapaFoto(d: DadosArte & { imagemUrl?: string; arraste?: boolean }) {
  const c1 = d.paleta[0];
  const logoW = Math.round(80 * 1.76);
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: d.corFundo || c1, fontFamily: "Baloo" }}>
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "1080px",
          height: "1350px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "70px",
          backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.05) 24%, rgba(0,0,0,0) 44%, rgba(0,0,0,0.6) 72%, rgba(0,0,0,0.93) 100%)",
        }}
      >
        {d.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoSrc} width={logoW} height={80} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }} />
        ) : <div style={{ display: "flex" }} />}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 96 : 116} />
          {d.textoApoio ? (
            <div style={{ display: "flex", marginTop: 18, fontSize: 40, color: BRANCO, lineHeight: 1.2, textShadow: "0 2px 8px rgba(0,0,0,0.85)", maxWidth: 900 }}>{d.textoApoio}</div>
          ) : null}
          <div style={{ display: "flex", marginTop: 28, fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.85)" }}>
            {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

// 🎈 Capa MOLDURA LÚDICA — fundo de cor festa + o título dentro de uma moldura branca
// arredondada (cara de quadro de festa), confete e logo.
export function LayoutCapaMoldura(d: DadosArte & { arraste?: boolean }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 35%, rgba(255,255,255,0.22), rgba(0,0,0,0.18) 72%)",
        fontFamily: "Baloo",
      }}
    >
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          width: 880,
          padding: "72px 56px",
          borderRadius: 52,
          backgroundColor: "rgba(255,255,255,0.10)",
          border: "10px solid #fff",
          boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
        }}
      >
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 86 : 102} fundo={fundo} />
        {d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 24, fontSize: 38, color: BRANCO, lineHeight: 1.25, textAlign: "center", textShadow: "0 2px 6px rgba(0,0,0,0.45)", maxWidth: 740 }}>{d.textoApoio}</div>
        ) : null}
      </div>
      <div style={{ position: "absolute", bottom: 58, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 4px rgba(0,0,0,0.45)" }}>
        {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
      </div>
    </div>
  );
}

// 🔳 Capa FAIXA DIAGONAL — foto de fundo + faixa colorida na diagonal com o título.
// Estilo moderno de anúncio/catálogo.
export function LayoutCapaFaixa(d: DadosArte & { imagemUrl?: string; arraste?: boolean }) {
  const c1 = d.paleta[0];
  const fundo = d.corFundo || c1;
  const logoW = Math.round(72 * 1.76);
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo", overflow: "hidden" }}>
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
      ) : null}
      <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", backgroundColor: "rgba(0,0,0,0.22)", display: "flex" }} />
      {d.logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.logoSrc} width={logoW} height={72} style={{ position: "absolute", top: 60, left: 60, objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.6))" }} />
      ) : null}
      <div
        style={{
          position: "absolute",
          top: 540,
          left: -100,
          width: 1280,
          padding: "44px 0",
          backgroundColor: fundo,
          transform: "rotate(-8deg)",
          boxShadow: "0 16px 44px rgba(0,0,0,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "0 60px" }}>
          <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 78 : 94} fundo={fundo} />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 56, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.75)" }}>
        {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
      </div>
    </div>
  );
}

// ⭐ Feedback / Depoimento — prova social: card branco elegante sobre foto do espaço,
// 5 estrelas, "FEEDBACK" colorido, frase de destaque + depoimento REAL do cliente +
// autor + logo. O texto do depoimento NUNCA é inventado pela IA — vem do cliente.
export function LayoutFeedback(
  d: DadosArte & { imagemUrl?: string; depoimento?: string; autor?: string; estrelas?: number; destaque?: string; corCard?: string; fotoAutor?: string; google?: boolean; altura?: number }
) {
  const H = d.altura ?? 1350; // 1350 = feed (4:5); 1920 = story (9:16) — mesma largura (1080), card idêntico
  const paleta = d.paleta;
  const fundo = d.corFundo || escolherFundoFesta(paleta);
  const n = Math.max(1, Math.min(5, d.estrelas ?? 5));
  const dep = (d.depoimento || "").trim();
  // A fonte do depoimento encolhe conforme o texto cresce, pra caber depoimento longo.
  const depFont = dep.length > 380 ? 29 : dep.length > 260 ? 33 : dep.length > 150 ? 37 : 41;
  const logoW = Math.round(64 * 1.76);
  // Cor do CARD (balão). Se for escuro, o texto vira claro; se claro, texto escuro.
  const card = d.corCard || "#ffffff";
  const cardEscuro = luminancia(card) < 0.5;
  const corDep = cardEscuro ? "rgba(255,255,255,0.94)" : "#3a3a3a"; // depoimento
  const corAspas = cardEscuro ? "rgba(255,255,255,0.30)" : "#ECE7DD";
  const corDivisor = cardEscuro ? "rgba(255,255,255,0.22)" : "#E8E3DA";
  const corMarca = cardEscuro ? "#ffffff" : corContraste(paleta[0], card); // destaque + autor
  const estrelaSVG = (cor: string) =>
    `<svg xmlns="http://www.w3.org/2000/svg" width="58" height="58" viewBox="0 0 24 24"><path d="M12 2l2.9 6.26 6.86.55-5.2 4.5 1.6 6.7L12 16.9 5.84 20.5l1.6-6.7-5.2-4.5 6.86-.55z" fill="${cor}"/></svg>`;
  const letras = "FEEDBACK".split("");
  return (
    <div style={{ width: "1080px", height: `${H}px`, display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
      {/* Foto do espaço de fundo (opcional) + overlay escuro pra dar contraste ao card */}
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={H} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: `${H}px`, objectFit: "cover" }} />
      ) : null}
      <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: `${H}px`, display: "flex", backgroundColor: "rgba(0,0,0,0.5)" }} />

      {/* Área central que centraliza o card (deixa espaço pro logo no rodapé) */}
      <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: `${H}px`, display: "flex", alignItems: "center", justifyContent: "center", padding: "70px 64px 180px" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 936, backgroundColor: card, borderRadius: 46, padding: "64px 64px 58px", boxShadow: "0 30px 80px rgba(0,0,0,0.45)" }}>
          {/* Foto do cliente (opcional) num círculo emoldurado */}
          {d.fotoAutor ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={d.fotoAutor} width={172} height={172} style={{ width: "172px", height: "172px", objectFit: "cover", borderRadius: 9999, border: `6px solid ${corMarca}`, marginBottom: 22, boxShadow: "0 8px 22px rgba(0,0,0,0.22)" }} />
          ) : null}
          {/* Estrelas */}
          <div style={{ display: "flex", alignItems: "center" }}>
            {Array.from({ length: n }).map((_, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={svgDataUri(estrelaSVG("#E6B33E"))} width={58} height={58} style={{ marginLeft: i === 0 ? 0 : 6 }} />
            ))}
          </div>

          {/* FEEDBACK — cada letra numa cor da paleta (a vibe colorida das referências) */}
          <div style={{ display: "flex", marginTop: 20, fontFamily: "Fredoka" }}>
            {letras.map((L, i) => (
              <span key={i} style={{ display: "flex", fontSize: 90, color: corContraste(paleta[i % paleta.length], card), letterSpacing: 2 }}>{L}</span>
            ))}
          </div>

          {/* Divisor fino */}
          <div style={{ display: "flex", width: 320, height: 3, backgroundColor: corDivisor, marginTop: 12 }} />

          {/* Aspas decorativa */}
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 130, color: corAspas, height: 78, lineHeight: 1 }}>&#8220;</div>

          {/* Frase de destaque (curta) na cor da marca */}
          {d.destaque ? (
            <div style={{ display: "flex", textAlign: "center", fontFamily: "Fredoka", fontSize: 54, color: corMarca, lineHeight: 1.06, marginTop: 2, maxWidth: 740 }}>{d.destaque}</div>
          ) : null}

          {/* Depoimento REAL do cliente */}
          {dep ? (
            <div style={{ display: "flex", textAlign: "center", marginTop: 24, fontSize: depFont, color: corDep, lineHeight: 1.36, maxWidth: 760 }}>{dep}</div>
          ) : null}

          {/* Autor */}
          {d.autor ? (
            <div style={{ display: "flex", marginTop: 26, fontFamily: "Fredoka", fontSize: 36, color: corMarca }}>— {d.autor}</div>
          ) : null}

          {/* Selo "Avaliação no Google" (com o Google multicolor autêntico) — prova social forte */}
          {d.google ? (
            <div style={{ display: "flex", alignItems: "center", marginTop: 24, padding: "10px 26px", borderRadius: 999, backgroundColor: cardEscuro ? "rgba(255,255,255,0.12)" : "#f3f4f6", border: `1px solid ${cardEscuro ? "rgba(255,255,255,0.22)" : "#e4e4ea"}` }}>
              <span style={{ display: "flex", fontFamily: "Fredoka", fontSize: 28, color: cardEscuro ? "rgba(255,255,255,0.85)" : "#5f6368", marginRight: 10 }}>Avaliação no</span>
              {["G", "o", "o", "g", "l", "e"].map((L, i) => (
                <span key={i} style={{ display: "flex", fontFamily: "Fredoka", fontSize: 34, color: ["#4285F4", "#EA4335", "#FBBC05", "#4285F4", "#34A853", "#EA4335"][i] }}>{L}</span>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Logo da marca no rodapé (sobre a foto) */}
      {d.logoSrc ? (
        <div style={{ position: "absolute", bottom: 54, left: 0, width: "1080px", display: "flex", justifyContent: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.logoSrc} width={logoW} height={64} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 8px rgba(0,0,0,0.7))" }} />
        </div>
      ) : null}
    </div>
  );
}

// 🍱 Vitrine — 6 fotos REAIS em 2 fileiras de 3, com uma FAIXA CENTRAL colorida trazendo o
// título + subtítulo. Mostra variedade (comidinhas, brinquedos, festas) numa arte só.
export function LayoutVitrine(d: DadosArte & { fotos?: string[] }) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const fotos = (d.fotos || []).filter(Boolean).slice(0, 6);
  const logoW = Math.round(58 * 1.76);
  const slots = [
    { top: 0, left: 0 }, { top: 0, left: 360 }, { top: 0, left: 720 },
    { top: 940, left: 0 }, { top: 940, left: 360 }, { top: 940, left: 720 },
  ];
  const fillers = [c1, c3, c5, c2, c1, c3];
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
      {/* 6 fotos (2 fileiras de 3). Slot vazio = bloco de cor da paleta. */}
      {slots.map((s, i) =>
        fotos[i] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={fotos[i]} width={360} height={410} style={{ position: "absolute", top: s.top, left: s.left, width: "360px", height: "410px", objectFit: "cover" }} />
        ) : (
          <div key={i} style={{ position: "absolute", top: s.top, left: s.left, width: "360px", height: "410px", display: "flex", backgroundColor: fillers[i] }} />
        ),
      )}

      {/* Faixa central com título + subtítulo */}
      <div
        style={{
          position: "absolute",
          top: 410,
          left: 0,
          width: "1080px",
          height: "530px",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 70px",
          backgroundColor: fundo,
          backgroundImage: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.20), rgba(0,0,0,0.12) 78%)",
          boxShadow: "0 0 44px rgba(0,0,0,0.4)",
        }}
      >
        {d.logoSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={d.logoSrc} width={logoW} height={58} style={{ objectFit: "contain", marginBottom: 16, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 84 : 108} fundo={fundo} />
        </div>
        {d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 20, maxWidth: 880, textAlign: "center", fontSize: 40, color: BRANCO, lineHeight: 1.2, textShadow: "0 2px 6px rgba(0,0,0,0.5)" }}>{d.textoApoio}</div>
        ) : null}
        {d.telefone ? <div style={{ display: "flex", marginTop: 22 }}><CtaWhatsApp telefone={d.telefone} /></div> : null}
      </div>
    </div>
  );
}

// ⚔️ Enquete / VS — ENGAJAMENTO: foto + dois lados ("Salgados VS Docinhos") no topo e a
// PERGUNTA embaixo ("que lado você fica?"). Feito pra provocar COMENTÁRIO — o sinal que a
// inteligência da Bia mais valoriza. ladoA/ladoB são os dois times; o título é a pergunta.
export function LayoutEnquete(d: DadosArte & { imagemUrl?: string; ladoA?: string; ladoB?: string }) {
  const [c1, c2, c3] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0]];
  const fundo = d.corFundo || c1;
  const ladoA = (d.ladoA || "Time A").trim();
  const ladoB = (d.ladoB || "Time B").trim();
  const logoW = Math.round(70 * 1.76);
  const fA = ladoA.length > 14 ? 50 : ladoA.length > 9 ? 64 : 78;
  const fB = ladoB.length > 14 ? 50 : ladoB.length > 9 ? 64 : 78;
  return (
    <div style={{ width: "1080px", height: "1350px", display: "flex", position: "relative", backgroundColor: fundo, fontFamily: "Baloo" }}>
      {d.imagemUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={d.imagemUrl} width={1080} height={1350} style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", objectFit: "cover" }} />
      ) : null}
      <div style={{ position: "absolute", top: 0, left: 0, width: "1080px", height: "1350px", display: "flex", backgroundImage: "linear-gradient(to bottom, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.10) 26%, rgba(0,0,0,0.10) 58%, rgba(0,0,0,0.86) 100%)" }} />

      {/* Faixa VS no topo: ladoA  (VS)  ladoB */}
      <div style={{ position: "absolute", top: 84, left: 0, width: "1080px", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 56px" }}>
        <div style={{ display: "flex", flex: 1, justifyContent: "flex-end", textAlign: "right", fontFamily: "Fredoka", fontSize: fA, color: c2, textShadow: contorno(), letterSpacing: 1 }}>{ladoA}</div>
        <div style={{ display: "flex", width: 132, height: 132, borderRadius: 9999, backgroundColor: BRANCO, border: `8px solid ${c1}`, alignItems: "center", justifyContent: "center", margin: "0 24px", boxShadow: "0 10px 26px rgba(0,0,0,0.45)" }}>
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 60, color: c1 }}>VS</div>
        </div>
        <div style={{ display: "flex", flex: 1, justifyContent: "flex-start", fontFamily: "Fredoka", fontSize: fB, color: c3, textShadow: contorno(), letterSpacing: 1 }}>{ladoB}</div>
      </div>

      {/* Pergunta num balão LARGO (texto flui, sem quebra apertada) + logo embaixo */}
      {(() => {
        const pergunta = d.titulo.map((l) => l.t).join(" ").trim();
        const fontP = pergunta.length > 42 ? 50 : pergunta.length > 26 ? 60 : 74;
        return (
          <div style={{ position: "absolute", bottom: 0, left: 0, width: "1080px", display: "flex", flexDirection: "column", alignItems: "center", padding: "0 40px 54px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "100%", backgroundColor: fundo, borderRadius: 32, padding: "40px 56px", boxShadow: "0 14px 34px rgba(0,0,0,0.45)", marginBottom: 22 }}>
              <div style={{ display: "flex", textAlign: "center", fontFamily: "Fredoka", fontSize: fontP, color: corContraste(BRANCO, fundo), lineHeight: 1.08, textShadow: contorno(), letterSpacing: 1, maxWidth: 920 }}>{pergunta}</div>
            </div>
            {d.logoSrc ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={d.logoSrc} width={logoW} height={70} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.7))" }} />
            ) : (
              <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.6)" }}>{d.site}</div>
            )}
          </div>
        );
      })()}
    </div>
  );
}

// 💰 Preço / Pacote — oferta com VALORES em destaque: de/por, forma de pagamento,
// parcelas e economia. Os números são SEMPRE do dono (a IA não inventa preço).
export function LayoutPreco(
  d: DadosArte & { precoDe?: string; precoPor?: string; labelPor?: string; parcelas?: string; economia?: string; condicoes?: string[]; validade?: string; modoPreco?: string; imagemUrl?: string }
) {
  const [c1, c2, c3, c5] = [d.paleta[0], d.paleta[1] || d.paleta[0], d.paleta[2] || d.paleta[0], d.paleta[4] || d.paleta[0]];
  const fundo = d.corFundo || escolherFundoFesta(d.paleta);
  const conds = (d.condicoes || []).map((s) => s.trim()).filter(Boolean).slice(0, 3);
  const por = (d.precoPor || "").trim();
  const porFont = por.length > 9 ? 104 : por.length > 6 ? 124 : 142;
  // Modo de exibição do preço: "promo" (De→Por + economia), "unico" (só o valor) ou
  // "apartir" (A partir de). De/riscado e economia só aparecem no modo promoção.
  const modo = d.modoPreco || "promo";
  const ehPromo = modo === "promo";
  const chamada = modo === "apartir" ? "A PARTIR DE" : ehPromo ? "POR APENAS" : "";
  // Margem do topo e fonte do título adaptam ao nº de linhas pra TUDO (card + economia
  // + CTA) caber ACIMA da onda (top 1110). +extra quando há selo de validade no canto,
  // pra o título começar ABAIXO dele (senão o texto fica em cima do "ATÉ").
  const nLinhas = d.titulo.length;
  const margemTopo = (nLinhas >= 3 ? 130 : nLinhas === 2 ? 185 : 235) + (d.validade ? 100 : 0);
  const tFont = nLinhas >= 3 ? 74 : nLinhas === 2 ? 88 : 102;
  return (
    <div
      style={{
        width: "1080px",
        height: "1350px",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        backgroundColor: fundo,
        backgroundImage: "radial-gradient(circle at 50% 30%, rgba(255,255,255,0.26), rgba(0,0,0,0.18) 72%)",
        fontFamily: "Baloo",
      }}
    >
      {d.imagemUrl ? <FundoFoto src={d.imagemUrl} cor={fundo} /> : null}
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      {/* Selo de validade (carimbo no canto superior esquerdo) */}
      {d.validade ? (
        <div style={{ position: "absolute", top: 52, left: 52, width: 172, height: 172, borderRadius: 9999, backgroundColor: "#fff", border: `5px solid ${c1}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(-8deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.3)", padding: 14 }}>
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 20, color: PRETO }}>ATÉ</div>
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 40, color: c1, lineHeight: 1.0, textAlign: "center" }}>{d.validade}</div>
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0 70px", marginTop: margemTopo, flexGrow: 1 }}>
        {/* Título (chamada da promoção) */}
        <TituloMulticolor linhas={d.titulo} fontSize={tFont} fundo={fundo} />

        {/* Condições (pílulas) */}
        {conds.length ? (
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", marginTop: 18 }}>
            {conds.map((cnd, i) => (
              <div key={i} style={{ display: "flex", marginLeft: i === 0 ? 0 : 12, marginTop: 8, fontFamily: "Fredoka", fontSize: 26, color: PRETO, backgroundColor: "rgba(255,255,255,0.92)", padding: "7px 20px", borderRadius: 999 }}>{cnd}</div>
            ))}
          </div>
        ) : null}

        {/* Card de PREÇO */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: 24, backgroundColor: "#fff", borderRadius: 38, padding: "26px 56px 30px", boxShadow: "0 22px 60px rgba(0,0,0,0.4)", minWidth: 700 }}>
          {ehPromo && d.precoDe ? (
            <div style={{ display: "flex", alignItems: "center", fontFamily: "Fredoka", fontSize: 36, color: "#9a9a9a", textDecoration: "line-through" }}>De R$ {d.precoDe}</div>
          ) : null}
          {chamada ? (
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 30, color: PRETO, marginTop: ehPromo && d.precoDe ? 2 : 0 }}>{chamada}</div>
          ) : null}
          <div style={{ display: "flex", alignItems: "flex-start", marginTop: 2 }}>
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 46, color: c1, marginTop: 16, marginRight: 6 }}>R$</div>
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: porFont, color: c1, lineHeight: 1.0 }}>{por}</div>
          </div>
          {d.labelPor ? (
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 32, color: "#fff", backgroundColor: c1, padding: "5px 26px", borderRadius: 999, marginTop: 6, letterSpacing: 2 }}>{d.labelPor}</div>
          ) : null}
          {d.parcelas ? (
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 30, color: PRETO, marginTop: 12 }}>ou {d.parcelas}</div>
          ) : null}
        </div>

        {/* Economia (só no modo promoção De→Por) */}
        {ehPromo && d.economia ? (
          <div style={{ display: "flex", alignItems: "center", marginTop: 14, fontFamily: "Fredoka", fontSize: 30, color: PRETO, backgroundColor: c3, padding: "9px 30px", borderRadius: 999, transform: "rotate(-2deg)", boxShadow: "0 6px 0 rgba(0,0,0,0.2)" }}>
            ⭐ ECONOMIA DE R$ {d.economia}
          </div>
        ) : null}

        {/* CTA WhatsApp */}
        {d.telefone ? <div style={{ display: "flex", marginTop: 12 }}><CtaWhatsApp telefone={d.telefone} /></div> : null}
      </div>

      <OndaBase cor={c1} top={1190} />
      <div style={{ position: "absolute", bottom: 58, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
        {d.site}
      </div>
    </div>
  );
}
