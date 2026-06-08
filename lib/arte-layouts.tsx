// Layouts completos (canvas 1080x1350) por template, reaproveitados pelo route de
// produção e pela rota de preview. Cada função recebe os dados já prontos e
// devolve o JSX para o ImageResponse.
import { Confete, OndaBase, TituloMulticolor, CtaWhatsApp, LogoSolto, escolherFundoFesta, BRANCO, PRETO } from "@/lib/arte";

export type DadosArte = {
  paleta: string[];
  logoSrc: string;
  site: string;
  telefone: string;
  titulo: { t: string; c: string }[];
  textoApoio?: string;
  oferta?: string; // selo grande (ex: "10 CRIANÇAS GRÁTIS")
  validade?: string; // ex: "Válido até 15/02"
  corFundo?: string; // cor de fundo (default: azul da paleta)
};

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

      <div style={{ display: "flex", flexDirection: "column", padding: "0 80px", marginTop: 360, flexGrow: 1 }}>
        <TituloMulticolor linhas={d.titulo} fontSize={d.titulo.length >= 3 ? 100 : 116} />

        {d.textoApoio ? (
          <div style={{ display: "flex", marginTop: 26, fontSize: 42, color: BRANCO, lineHeight: 1.25, textShadow: "0 2px 6px rgba(0,0,0,0.45)", maxWidth: 840 }}>
            {d.textoApoio}
          </div>
        ) : null}

        {d.oferta ? (
          <div style={{ display: "flex", marginTop: 36 }}>
            <div style={{ display: "flex", fontFamily: "Fredoka", fontSize: 56, color: PRETO, backgroundColor: c3, padding: "16px 34px", borderRadius: 18, transform: "rotate(-2deg)", boxShadow: "0 8px 0 rgba(0,0,0,0.2)" }}>
              {d.oferta}
            </div>
          </div>
        ) : null}

        <div style={{ display: "flex", marginTop: 44 }}>
          {d.telefone ? <CtaWhatsApp telefone={d.telefone} /> : null}
        </div>

        {d.validade ? (
          <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "rgba(255,255,255,0.92)", fontFamily: "Fredoka", textShadow: "0 2px 4px rgba(0,0,0,0.4)" }}>
            {d.validade}
          </div>
        ) : null}
      </div>

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
