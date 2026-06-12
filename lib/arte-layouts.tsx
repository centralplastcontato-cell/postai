// Layouts completos (canvas 1080x1350) por template, reaproveitados pelo route de
// produção e pela rota de preview. Cada função recebe os dados já prontos e
// devolve o JSX para o ImageResponse.
import { Confete, OndaBase, TituloMulticolor, CtaWhatsApp, LogoSolto, escolherFundoFesta, contorno, BRANCO, PRETO } from "@/lib/arte";

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

// 🎉 Promoção / Oferta — fundo colorido festa + selo + CTA WhatsApp.
export function LayoutPromocao(d: DadosArte) {
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
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      {(() => {
        const itens = (d.inclui || []).filter((s) => s && s.trim()).slice(0, 5);
        const temLista = itens.length > 0;
        const rodape = [rotularValidade(d.validade), d.regras].filter((s) => s && s.trim()).join("  ·  ");
        // Título longo (3-4 linhas) + lista ocupam muito: encolhe a fonte e sobe a
        // margem do topo pra TUDO (inclusive o telefone) caber ACIMA da onda (top 1110).
        const nLinhas = d.titulo.length;
        const fonteTitulo = nLinhas >= 4 ? 82 : nLinhas === 3 ? 94 : 112;
        const margemTopo = Math.max(120, (nLinhas >= 4 ? 200 : nLinhas === 3 ? 270 : 350) - (temLista ? 50 : 0) - itens.length * 12);
        return (
          <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", marginTop: margemTopo, flexGrow: 1 }}>
            <TituloMulticolor linhas={d.titulo} fontSize={fonteTitulo} />

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
        {/* Logo no topo (centralizado) */}
        {d.logoSrc ? (
          <div style={{ display: "flex" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.logoSrc} width={logoW} height={96} style={{ objectFit: "contain", filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.5))" }} />
          </div>
        ) : <div style={{ display: "flex" }} />}

        {/* Saudação grande centralizada + selo + apoio */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          {d.selo ? (
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 38, color: PRETO, backgroundColor: c3, padding: "10px 30px", borderRadius: 999, marginBottom: 30, transform: "rotate(-2deg)", boxShadow: "0 6px 0 rgba(0,0,0,0.22)" }}>
              {d.selo}
            </div>
          ) : null}

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", fontFamily: "Fredoka" }}>
            {d.titulo.map((l, i) => (
              <div key={i} style={{ display: "flex", fontSize: d.titulo.length >= 3 ? 104 : 124, color: l.c, lineHeight: 1.0, textShadow: contorno(), letterSpacing: 1, textAlign: "center" }}>
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

        {/* Rodapé: site (+ WhatsApp se houver) */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
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
export function LayoutDivulgacao(d: DadosArte) {
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
      <Confete cores={[c2, c3, c5, c1]} />
      {d.logoSrc ? <LogoSolto src={d.logoSrc} /> : null}

      <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", marginTop: 300, flexGrow: 1 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 92 : 108} />

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

        <div style={{ display: "flex", marginTop: 48 }}>
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
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 104 : 120} />
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
export function LayoutAnivCard(d: DadosArte & { nome?: string; idade?: string; fotoUrl?: string }) {
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
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 76 : 92} />
      </div>

      {/* Selo de oferta (carimbo circular) — só quando há oferta */}
      {d.oferta ? (
        <div style={{ position: "absolute", top: 560, left: 70, width: 250, height: 250, borderRadius: 9999, backgroundColor: "#fff", border: `6px solid ${c1}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: "rotate(-7deg)", boxShadow: "0 10px 24px rgba(0,0,0,0.3)", padding: 18 }}>
          <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 42, color: c1, textAlign: "center", lineHeight: 1.0 }}>{d.oferta}</div>
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
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 104 : 124} />
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
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 86 : 102} />
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
          <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 78 : 94} />
        </div>
      </div>
      <div style={{ position: "absolute", bottom: 56, left: 0, width: "1080px", display: "flex", justifyContent: "center", fontFamily: "Fredoka", fontSize: 30, color: BRANCO, textShadow: "0 2px 6px rgba(0,0,0,0.75)" }}>
        {d.site}{d.site && d.arraste ? "   ·   " : ""}{d.arraste ? "arraste →" : ""}
      </div>
    </div>
  );
}
