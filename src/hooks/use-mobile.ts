import * as React from "react"

const MOBILE_BREAKPOINT = 768

const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Reescrito em relação ao que o shadcn gera: a versão original chamava
 * `setState` dentro do corpo do efeito só para pegar o valor inicial, o que a
 * regra `react-hooks/set-state-in-effect` acusa como erro e derrubaria o lint do
 * CI. `useSyncExternalStore` é o encaixe certo para ler um `matchMedia` — o
 * snapshot do servidor devolve `false` porque no SSR não existe viewport, e a
 * sidebar deve renderizar na forma de desktop até o cliente dizer o contrário.
 */
function subscrever(onChange: () => void) {
  const mql = window.matchMedia(QUERY)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscrever,
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
