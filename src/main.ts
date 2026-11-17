import '@fontsource/cinzel/400.css';
import '@fontsource/cinzel/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/600.css';
import './styles/base.css';
import './styles/telas.css';
import './styles/criacao.css';
import './styles/sonho.css';

import { irPara, registrarTela } from './core/telas';
import { telaCriacao } from './screens/criacao';
import { telaEmBreve } from './screens/emBreve';
import { telaIntro } from './screens/intro';
import { telaLoading } from './screens/loading';
import { telaMenu } from './screens/menu';
import { telaPrologo } from './screens/prologo';
import { telaSonho } from './screens/sonho';
import { telaDespertar } from './screens/despertar';

registrarTela('loading', telaLoading);
registrarTela('intro', telaIntro);
registrarTela('menu', telaMenu);
registrarTela('criacao', telaCriacao);
registrarTela('prologo', telaPrologo);
registrarTela('sonho', telaSonho);
registrarTela('despertar', telaDespertar);
registrarTela('emBreve', telaEmBreve);

void irPara('loading', undefined, { som: false, duracao: 0 });

// Só no `npm run dev`: acesso ao áudio pelo console para testes.
if (import.meta.env.DEV) {
  void import('./core/audio').then(({ audio }) => Object.assign(window, { __audio: audio, __irPara: irPara }));
}
