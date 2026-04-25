# SwimCoach PWA — Guia de Instalação

## Android (Chrome) — Tablet na piscina

1. Transfira a pasta `swim-coach-pwa` para o tablet (via USB, Google Drive ou email como ZIP)
2. Extraia o ZIP para uma pasta local
3. Abra o Chrome e navegue até ao ficheiro `index.html`  
   *(ou utilize um servidor local — ver abaixo)*
4. Toque no menu **⋮** → **"Adicionar ao ecrã inicial"**
5. A app instala-se como aplicação nativa

## Opção recomendada — servidor local simples
Se tiver Python instalado no tablet ou PC:
```
cd swim-coach-pwa
python3 -m http.server 8080
```
Depois abra `http://localhost:8080` no Chrome.

## Funcionalidades
- **Plano** — visualiza o plano semanal por dia e sessão (Manhã/Tarde)
- **Cronómetro** — cronometra e regista parciais por atleta e bloco, com comparação vs. tempo alvo
- **Atletas** — gere a lista de atletas
- **Zonas** — regista metros realizados por zona e compara com o planeado (Plano vs Escrito)
- **Resultados** — consulta e exporta todos os parciais guardados em CSV

## Formato do Excel
O ficheiro Excel deve seguir o formato habitual com:
- Cabeçalhos dos dias: SEGUNDA-FEIRA, TERÇA-FEIRA, QUARTA-FEIRA, QUINTA-FEIRA, SEXTA-FEIRA, SÁBADO, DOMINGO
- Coluna B: P25 ou P50 (piscina)
- Coluna C: Zona (TT, A1, A2, A3, M.AER, LAN, M.ANA, VEL, PML, TL) ou cabeçalho de bloco (AQUECIMENTO, TAREFA 1, etc.)
- Coluna D: Descrição do exercício
- Coluna L: Ciclo / intervalo de descanso
- Coluna O: Metros (Manhã)
- Coluna S: Zona (Tarde)
- Coluna T: Descrição (Tarde)
- Coluna AB: Ciclo (Tarde)
- Coluna AE: Metros (Tarde)

## Dados guardados
Todos os dados (atletas, resultados, metros por zona) são guardados localmente no dispositivo via localStorage.
Não é necessária ligação à internet após o primeiro carregamento.
