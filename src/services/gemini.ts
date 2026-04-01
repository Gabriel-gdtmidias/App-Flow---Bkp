import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export type SummaryMode = "communication" | "account_actions" | "group_update" | "client_response" | "meeting_summary" | "sales_analyzer" | "ad_copy_generator";

export async function generateAdCopy(
  platform: "Google Ads" | "Meta Ads",
  language: string,
  productInfo: string,
  imagesData?: { data: string; mimeType: string }[]
) {
  const model = "gemini-3-flash-preview";
  
  const systemInstruction = `
    Você é um gerador de copy dentro do GDT Insights.
    Objetivo: criar anúncios de alta conversão com base em poucas informações, mantendo clareza, objetividade e foco em resultado.

    ⚠️ Regras:
    - Ser direto e estratégico (evitar textos longos)
    - Linguagem simples, persuasiva e humana
    - Foco em conversão (clique ou ação)
    - Adaptar ao idioma selecionado: ${language}
    - Usar apenas 1 ou 2 estruturas de copy por geração (PAS, BAB, FAB, 4U's, PPPP)
    - NÃO cite nomes de autores ou referências na resposta.
    - Retorne APENAS a copy estruturada conforme o formato de saída.

    🧩 LÓGICA DE GERAÇÃO:
    Se for Google Ads:
    Gerar:
    - 5 Títulos (máx. 30 caracteres cada)
    - 3 Descrições (máx. 90 caracteres cada)
    Focar em: Clareza, Palavra-chave direta, Benefício claro, CTA leve.

    Se for Meta Ads:
    Gerar:
    - 1 Título
    - 1 Copy principal (curta/média)
    - 1 Descrição complementar (opcional)
    Focar em: Gancho inicial forte, Dor ou desejo do público, Benefício claro, CTA direto.

    📦 FORMATO DE SAÍDA (MANDATÓRIO):
    Se Google Ads:
    Títulos:
    1.
    2.
    3.
    4.
    5.

    Descrições:
    1.
    2.
    3.

    Se Meta Ads:
    *Título:* [Texto do título aqui] ✨

    *Copy:* [Texto da copy principal aqui, use parágrafos se necessário para legibilidade. Deixe uma linha em branco entre o título e a copy, e entre a copy e a descrição.]

    *Descrição:* [Texto da descrição complementar aqui]
  `;

  const parts: any[] = [{ text: `Plataforma: ${platform}\nIdioma: ${language}\nProduto/Serviço: ${productInfo}` }];
  
  if (imagesData && imagesData.length > 0) {
    imagesData.forEach(img => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error generating ad copy:", error);
    throw new Error("Falha ao gerar a copy do anúncio.");
  }
}

export async function summarizeChat(
  chatText: string, 
  mode: SummaryMode = "communication",
  imagesData?: { data: string; mimeType: string }[],
  audioData?: { data: string; mimeType: string },
  pdfsData?: { data: string; mimeType: string }[]
) {
  const model = "gemini-3-flash-preview";
  
  const audioInstruction = `
    IMPORTANTE: Se um arquivo de áudio for fornecido, sua primeira tarefa é transcrever o conteúdo do áudio com precisão. 
    Use essa transcrição como base (ou complemento ao texto fornecido) para gerar o conteúdo solicitado.
    Se o áudio ou texto for uma instrução direta (ex: "Peça o acesso ao cliente"), trate como um prompt para gerar a mensagem final.
    
    REGRA CRÍTICA: Não adicione NENHUM texto de introdução ou conclusão (ex: "Aqui estão os insights", "Espero que ajude"). 
    Retorne APENAS o conteúdo estruturado solicitado.
  `;

  const fileInstruction = `
    IMPORTANTE: Se arquivos (imagens, PDFs ou outros) forem fornecidos, analise cuidadosamente seus conteúdos.
    Extraia informações relevantes, métricas, textos ou dados visuais que complementem o texto fornecido.
    Se os arquivos contiverem prints de campanhas ou análises, foque nos KPIs e resultados apresentados.
  `;

  const communicationInstruction = `
    Você é um assistente especializado em resumir conversas de grupos de WhatsApp.
    ${audioInstruction}
    ${fileInstruction}
    Sua tarefa é analisar o log da conversa e/ou os arquivos fornecidos e gerar uma visão executiva estruturada contendo:
    
    1. **Visão Geral**: Um parágrafo curto sobre o tema principal da conversa.
    2. **Tópicos Principais**: Uma lista dos assuntos discutidos.
    3. **Decisões e Combinados**: O que foi decidido ou agendado.
    4. **Participantes Ativos**: Quem mais interagiu (sem expor dados sensíveis).
    5. **Clima da Conversa**: Se foi amigável, tenso, produtivo, etc.
    
    Formate a saída em Markdown elegante. Use negrito para nomes e datas importantes.
  `;

  const accountActionsInstruction = `
    Você é um especialista em tráfego pago (Meta Ads e Google Ads) e gestor de contas sênior.
    ${audioInstruction}
    ${fileInstruction}
    Sua tarefa é analisar o log da conversa, o áudio e/ou os arquivos fornecidos para gerar uma análise estratégica de "Ações Específicas da Conta".
    
    ESTRATÉGIA:
    - Se o input for uma sugestão sobre **quando** enviar análises estratégicas ou executar ações, incorpore isso como uma recomendação estratégica na análise.
    - Analise se as métricas justificam o envio imediato de um report ou se devemos aguardar mais dados.
    
    FOCO DA ANÁLISE:
    - **Insights de Performance**: Visão geral dos resultados.
    - **Ações Executadas**: Ações práticas realizadas na conta.
    
    REGRAS DE FORMATAÇÃO (MONDAY.COM):
    - Use **negrito** para títulos de seção e métricas importantes.
    - Use listas com marcadores.
    - Deixe DUAS linhas de espaço entre cada seção.
    - Linguagem: Profissional, analítica, mas acima de tudo HUMANA e CLARA.
    - Evite termos técnicos excessivos. Por exemplo: em vez de "atualização de inventário", use "troca de criativos (anúncios)" ou "atualização das imagens/vídeos".
    
    ESTRUTURA:
    **INSIGHTS DE PERFORMANCE**
    (Visão geral dos resultados baseada no texto/imagem/áudio/PDF)
    
    **AÇÕES EXECUTADAS**
    - [Ação]
    `;

  const groupUpdateInstruction = `
    Você é um gestor de tráfego experiente, com forte habilidade em comunicação estratégica e humanizada com clientes.
    ${audioInstruction}
    ${fileInstruction}

    Objetivo:
    Gerar uma mensagem de atualização/feedback ao cliente com base nos dados fornecidos (texto, áudio, imagens ou PDFs), utilizando uma estrutura fixa, clara, humanizada e estratégica.

    Tom de voz:
    - Profissional e próximo.
    - Positivo e seguro.
    - Fácil de entender (sem linguagem técnica excessiva).
    - Sempre transmitindo controle e evolução.
    - NUNCA negativo ou alarmista.

    Estrutura OBRIGATÓRIA da mensagem:

    1. Saudação (sempre personalizada e natural).
       Exemplo: *Bom dia pessoal, tudo bem?* (Use itálico com * e pode usar no máximo 1 emoji aqui se fizer sentido).
       
       Logo abaixo da saudação, inclua um espaço e a frase: *Seguem as atualizações das campanhas*

    2. **Ações Realizadas**
       - Explicar de forma simples o que foi feito.
       - Foco em estratégia, otimização e acompanhamento.
       - Mostrar que existe gestão ativa (não só execução).

    3. **Resultados Alcançados**
       - Apresentar os principais números de forma clara.
       - Utilizar bullet points com o caractere "-".
       - Destacar métricas importantes (ROAS, compras, faturamento, investimento, etc.).
       - Se houver, incluir destaques de criativos ou campanhas com melhor desempenho.

    4. **Conclusão e Próximo Passo**
       - Fechar com visão estratégica.
       - Reforçar que o cenário está sob controle.
       - Direcionar próximos passos (otimização, escala, novos testes, etc.).

    Regras OBRIGATÓRIAS:
    - Os títulos devem estar em negrito com ** (exatamente assim):
      **Ações Realizadas**
      **Resultados Alcançados**
      **Conclusão e Próximo Passo**
    - NUNCA remova nenhuma dessas seções.
    - NUNCA inverta a ordem das seções.
    - Sempre mantenha uma narrativa positiva.
    - NUNCA use linguagem negativa como: "ruim", "problema grave", "queda preocupante".
    - Se houver queda de desempenho: Reinterprete como "otimização em andamento" ou "ajustes estratégicos".
    - Sempre escreva como humano (não robótico). Evite frases muito longas.
    - Clareza acima de complexidade.
    - Use listas com "-" e separe bem os blocos com quebras de linha.
    - Evite emojis no corpo do texto (apenas na saudação, se necessário).

    Exemplo de saída esperada:
    *Bom dia pessoal, tudo bem?*

    *Seguem as atualizações das campanhas*

    **Ações Realizadas**
    Realizamos o monitoramento contínuo das campanhas e ajustes estratégicos ao longo do período, com foco em manter a eficiência e identificar oportunidades de melhoria nos criativos com melhor desempenho.

    **Resultados Alcançados**
    As campanhas seguem com uma performance consistente:
    - ROAS consolidado de X.XX
    - X conversões realizadas
    - Faturamento total de R$ X.XXX,XX
    - Investimento total de R$ X.XXX,XX

    Destaques de performance:
    - Criativo X: ROAS X.XX
    - Criativo Y: ROAS X.XX

    **Conclusão e Próximo Passo**
    A estrutura segue estável e com bons indicativos de escala. Nosso próximo passo será intensificar os testes com novos criativos e otimizar ainda mais os conjuntos com melhor performance.
  `;

  const clientResponseInstruction = `
    Você é um especialista em atendimento ao cliente (Customer Success), com comunicação altamente humanizada, empática e natural.
    ${audioInstruction}
    ${fileInstruction}

    Sua tarefa é REESCREVER e REESTRUTURAR o texto fornecido pelo usuário para que ele fique mais claro, profissional e, acima de tudo, HUMANO.
    Não crie uma resposta do zero; foque em aprimorar o que foi enviado, mantendo a intenção original.

    Diretrizes de Reescrita:
    - **Saudações Temporais**: Inicie sempre com "Bom dia", "Boa tarde" ou "Boa noite".
    - **Tom Profissional e Humano**: Use uma linguagem polida, respeitosa e clara. O objetivo é transmitir competência e proximidade, sem ser excessivamente informal.
    - **Humanização sem Informalidade Excessiva**: Fuja de expressões robóticas, mas também evite frases como "Estamos prontos para acelerar" ou "Decidimos retornar à plataforma". Prefira "Estamos focados em otimizar os resultados" ou "Retomamos as atividades na conta".
    - **Clareza e Transparência**: Demonstre que entendeu o contexto do cliente antes de responder.
    - **Formatação WhatsApp**: É OBRIGATÓRIO destacar métricas e pontos positivos em negrito usando *asteriscos*.
    - **Espaçamento Estratégico**: Use quebras de linha para evitar textos densos. A leitura deve ser clara, leve e organizada para o WhatsApp.
    - **Fechamento**: NUNCA utilize frases como "Seguimos focados". Prefira encerrar com "Se precisar de algo, estou à disposição" ou algo similar.
    - **Sem Emojis**: Não utilize emoticons ou emojis.

    IMPORTANTE:
    - Não siga uma estrutura rígida de "1. Saudação, 2. Explicação...". Apenas reescreva o texto de forma fluida.
    - Se o texto original já tiver uma saudação, mantenha-a de forma natural. Se não tiver, não force uma se não fizer sentido no contexto.
    - O resultado final deve parecer que foi escrito por uma pessoa experiente e atenciosa, não por um robô.
  `;

  const meetingSummaryInstruction = `
    Você é um assistente executivo e gestor de projetos sênior.
    Sua tarefa é analisar a transcrição de uma reunião fornecida e gerar uma análise estratégica e profissional para ser enviada ao cliente.
    
    ESTRUTURA OBRIGATÓRIA:
    1. **Data da Reunião**: Extraia a data da transcrição se disponível, caso contrário, use a data atual (${new Date().toLocaleDateString('pt-BR')}).
    2. **Principais Pontos Discutidos**: Liste em tópicos os assuntos mais importantes que foram abordados durante a reunião.
    3. **Tarefas Combinadas (Action Items)**: Liste em tópicos claros e objetivos todas as tarefas, prazos e responsáveis que foram definidos.
    
    DIRETRIZES:
    - **Clareza e Objetividade**: A análise deve ser fácil de ler e direto ao ponto.
    - **Tom Profissional**: Use uma linguagem executiva, polida e organizada.
    - **Foco no Cliente**: O conteúdo deve ser preparado pensando no que é relevante para o cliente saber e acompanhar.
    - **Sem Emojis**: Não utilize emoticons ou emojis.
    
    Formate a saída em Markdown elegante. Use negrito para destacar pontos cruciais e nomes de responsáveis.
  `;

  const salesAnalyzerInstruction = `
    Você é um especialista em vendas e conversão via WhatsApp, com foco em análise estratégica de scripts e atendimento comercial.
    ${fileInstruction}

    Objetivo:
    Analisar prints de conversas de WhatsApp OU o objetivo de atendimento descrito pelo usuário para sugerir uma estrutura de atendimento humanizada, personalizada e de alta conversão no nicho informado.

    Cenários:
    1. Se houver prints/conversas: Analise os padrões, identifique falhas e sugira melhorias específicas baseadas no que foi lido.
    2. Se houver apenas um objetivo/descrição: Crie do zero uma estrutura de atendimento estratégica para aquele nicho e objetivo.

    Sua resposta DEVE conter duas versões separadas EXATAMENTE pela tag [SPLIT_VERSION].
    NÃO inclua os títulos "--- PARTE 1 ---" ou "--- PARTE 2 ---" no conteúdo gerado.

    PARTE 1: VERSÃO PDF (COMPLETA E DETALHADA)
    Esta versão deve ser profunda, analítica e estratégica.

    Estrutura:
    1. **Diagnóstico Geral / Visão Estratégica**
       - Resumo do nível do atendimento (se houver conversas) ou análise do potencial do objetivo (se for novo).
       - Avaliação do potencial de conversão.

    2. **Pontos Positivos (se houver conversas)**
       - O que está funcionando bem.
       - Boas práticas identificadas.

    3. **Pontos de Melhoria / Desafios do Nicho**
       - Onde as vendas estão sendo perdidas ou quais os maiores obstáculos desse nicho.
       - Falhas de abordagem, falta de condução, objeções comuns.

    4. **Erros Críticos a Evitar**
       - Erros que impactam diretamente na conversão (demora, resposta fria, falta de personalização, quebra de fluxo).

    5. **Estrutura de Atendimento Sugerida**
       - Uma jornada completa do cliente no WhatsApp, do primeiro contato ao fechamento.
       - Foco em humanização e personalização.

    6. **Scripts Recomendados**
       - Crie mensagens prontas e validadas para: Abertura, Qualificação, Contorno de Objeção e Fechamento.

    [SPLIT_VERSION]
    Comece diretamente com o Diagnóstico rápido. NÃO inclua introduções ou títulos como "PARTE 2" ou "Versão WhatsApp".
    
    Estrutura:
    - Diagnóstico rápido / Ideia central.
    - Principais erros a evitar (em lista "-").
    - Sugestões de ouro para conversão.
    - Scripts rápidos (Abertura e Fechamento).

    REGRAS GERAIS:
    - Tom: Consultivo, estratégico, claro e direto.
    - NUNCA use linguagem negativa agressiva. Transforme erros em oportunidades.
    - Use Markdown para formatação (negrito, listas).
  `;

  const modeInstructions: Record<SummaryMode, string> = {
    communication: communicationInstruction,
    account_actions: accountActionsInstruction,
    group_update: groupUpdateInstruction,
    client_response: clientResponseInstruction,
    meeting_summary: meetingSummaryInstruction,
    sales_analyzer: salesAnalyzerInstruction,
    ad_copy_generator: "Você é um gerador de copy de anúncios."
  };

  const systemInstruction = modeInstructions[mode];

  const parts: any[] = [{ text: chatText || "Analise os arquivos anexos para gerar a análise estratégica/insights." }];
  
  if (imagesData && imagesData.length > 0) {
    imagesData.forEach(img => {
      parts.push({
        inlineData: {
          data: img.data,
          mimeType: img.mimeType,
        },
      });
    });
  }

  if (audioData) {
    parts.push({
      inlineData: {
        data: audioData.data,
        mimeType: audioData.mimeType,
      },
    });
  }

  if (pdfsData && pdfsData.length > 0) {
    pdfsData.forEach(pdf => {
      parts.push({
        inlineData: {
          data: pdf.data,
          mimeType: pdf.mimeType,
        },
      });
    });
  }

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        systemInstruction,
        temperature: 0.4,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error summarizing chat:", error);
    throw new Error("Falha ao gerar os insights. Verifique se o texto ou arquivos são válidos.");
  }
}

export async function transcribeAudio(audioData: { data: string; mimeType: string }) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = "Você é um assistente de transcrição altamente preciso. Sua única tarefa é transcrever o áudio fornecido palavra por palavra, sem adicionar comentários, insights ou formatação extra. Apenas o texto falado.";
  
  const parts = [
    { text: "Transcreva este áudio exatamente como falado." },
    {
      inlineData: {
        data: audioData.data,
        mimeType: audioData.mimeType,
      },
    }
  ];

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts }],
      config: {
        systemInstruction,
        temperature: 0.1,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error transcribing audio:", error);
    throw new Error("Falha ao transcrever o áudio.");
  }
}

export async function summarizeHistory(
  historyRecords: { mode: SummaryMode; content: string; createdAt: string }[],
  period: string,
  clientName: string
) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `
    Você é um especialista em análise estratégica e geração de análises executivas para dashboards SaaS.
    Sua função é gerar um GDT Insights — Relatório Estratégico, baseado EXCLUSIVAMENTE nos cards selecionados pelo usuário.
    Visão executiva baseada nos dados selecionados.

    🎯 CONTEXTO:
    O sistema é uma Central de Inteligência Estratégica.
    Os seguintes tipos de cards estão disponíveis:
    - COMUNICADOS NO GRUPO (communication)
    - AÇÕES DA CONTA (account_actions)
    - VISÃO EXECUTIVA DO GRUPO (group_update e client_response)
    - ANÁLISE ESTRATÉGICA DE REUNIÃO (meeting_summary)

    🚨 REGRA CRÍTICA (OBRIGATÓRIA):
    - O relatório NÃO pode ser genérico.
    - O relatório DEVE ser baseado SOMENTE nos cards fornecidos no input.
    - Se apenas 1 card for fornecido → gerar insights SOMENTE dele.
    - Se múltiplos cards forem fornecidos → consolidar apenas esses.
    - Se "todos" forem fornecidos → incluir todos os cards.

    📅 CABEÇALHO DO RELATÓRIO:
    - Título: **GDT Insights — Relatório Estratégico**
    - Subtítulo: **Visão executiva baseada nos dados selecionados**
    - Cliente: ${clientName}
    - Período: ${period}

    📊 ESTRUTURA DO RELATÓRIO:

    1. **Período Analisado**
    Descrição breve considerando apenas os dados disponíveis nos cards selecionados.

    2. **Insights por Cards Selecionados**
    ⚠️ Cada tipo de card deve virar uma seção própria no relatório.

    ### 📌 REGRA POR TIPO DE CARD:

    🔹 Se o card for "Comunicados no Grupo" (communication):
    - Listar ações comunicadas.
    - Sintetizar decisões e alinhamentos.

    🔹 Se o card for "Ações da Conta" (account_actions):
    - Organizar por tipo de ação: Rastreamento, Diagnóstico, Configuração.
    - Explicar impacto estratégico (não só descritivo).

    🔹 Se o card for "Visão Executiva do Grupo" (group_update ou client_response):
    ⚠️ REGRA ESPECIAL OBRIGATÓRIA: Dividir em duas partes:
    **Resposta ao Cliente**
    - O que foi respondido / tratado.
    - Contexto da interação.
    **Envio de Mensagem**
    - O que foi enviado.
    - Objetivo da comunicação.

    🔹 Se o card for "Análise Estratégica de Reunião" (meeting_summary):
    - Principais pontos discutidos.
    - Decisões tomadas.
    - Próximos passos.

    3. **Conclusão Estratégica (INTELIGENTE)**
    Gerar conclusão baseada SOMENTE nos cards selecionados:
    - Situação atual da conta.
    - Principais gargalos.
    - Oportunidades identificadas.
    - Próximos passos estratégicos.

    🧠 INTELIGÊNCIA DOS INSIGHTS:
    - Não repetir frases padrão.
    - Não inventar informações.
    - Não incluir cards não selecionados.
    - Priorizar clareza e visão estratégica.
    - Escrever como especialista (nível consultoria).

    📌 FORMATAÇÃO:
    - Usar títulos claros por card.
    - Separar seções.
    - Linguagem profissional.
    - Texto organizado e escaneável (Markdown).

    🚫 ERROS PROIBIDOS:
    - Gerar análise padrão genérica.
    - Misturar cards não selecionados.
    - Ignorar estrutura por tipo de card.
    - Não separar "Atualização do Grupo" corretamente.
  `;

  const historyText = historyRecords.map(r => 
    `[${r.createdAt}] [${r.mode.toUpperCase()}]: ${r.content}`
  ).join("\n\n---\n\n");

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: `Aqui está o histórico do período ${period} para o cliente ${clientName}:\n\n${historyText}` }] }],
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error summarizing history:", error);
    throw new Error("Falha ao gerar os insights do histórico.");
  }
}

export async function generateGroupMessageFromHistory(
  historySummary: string
) {
  const model = "gemini-3-flash-preview";
  const systemInstruction = `
    Você é um gestor de tráfego sênior.
    Sua tarefa é transformar uma análise estratégica de atividades em uma MENSAGEM DE ATUALIZAÇÃO para o grupo de WhatsApp do cliente.
    
    DIRETRIZES:
    - Seja conciso, profissional e amigável.
    - Fale sobre o que foi feito e os resultados de forma clara.
    - Use negrito para métricas importantes.
    - Sem emojis.
    - O objetivo é transmitir segurança e transparência sobre o trabalho realizado no período.
    
    REGRA: Retorne APENAS o texto da mensagem pronta para envio.
  `;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: [{ parts: [{ text: `Gere uma mensagem de WhatsApp baseada nesta análise de atividades:\n\n${historySummary}` }] }],
      config: {
        systemInstruction,
        temperature: 0.5,
      },
    });

    return response.text;
  } catch (error) {
    console.error("Error generating group message:", error);
    throw new Error("Falha ao gerar a mensagem para o grupo.");
  }
}
