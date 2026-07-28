// Disparo de workflows via API REST do GitHub (workflow_dispatch) — o caminho
// pelo qual o Next.js delega trabalho pesado ao GitHub Actions (CLAUDE.md Seção 3.1).

export async function dispararWorkflow(
  workflow: string,
  inputs: Record<string, string>,
): Promise<void> {
  const pat = process.env.GITHUB_PAT;
  const repo = process.env.GITHUB_REPO;
  if (!pat || !repo) {
    throw new Error('GITHUB_PAT/GITHUB_REPO não configurados (ver .env.example)');
  }

  const resp = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${pat}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'main', inputs }),
    },
  );

  // Sucesso do dispatch é 204 sem corpo; qualquer outra coisa é erro real.
  if (resp.status !== 204) {
    const corpo = await resp.text().catch(() => '');
    throw new Error(`workflow_dispatch de ${workflow} falhou: HTTP ${resp.status} ${corpo}`.trim());
  }
}
