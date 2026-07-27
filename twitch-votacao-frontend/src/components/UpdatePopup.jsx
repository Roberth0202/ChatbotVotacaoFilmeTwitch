import React, { useState, useEffect } from 'react';
import { Sparkles, Swords, MessageSquare, Trophy, X, ChevronLeft, ChevronRight, ZoomIn } from 'lucide-react';

const CURRENT_UPDATE_VERSION = 'v1.2.0_mata_mata';

const UPDATES_LIST = [
  {
    id: 'mata-mata',
    tag: 'Painel Admin',
    title: '1. Início do Torneio Mata-Mata',
    summary: 'Organize os 4 filmes mais votados em um campeonato de eliminatórias.',
    description: 'No Painel Admin, os moderadores ou o streamer podem configurar a duração de cada round (ex: 60 segundos) e iniciar o Mata-Mata. O sistema puxa automaticamente os Top 4 filmes da votação geral e sorteia as Semifinais.',
    image: '/updates/começar_mata-mata.png',
    badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    icon: Swords
  },
  {
    id: 'chat-vote',
    tag: 'Chat da Live',
    title: '2. Votação no Chat (!1 ou !2)',
    summary: 'Os espectadores votam diretamente na Twitch em tempo real.',
    description: 'Com o duelo rodando, o chat da live pode participar digitando apenas !1 (para o filme da esquerda) ou !2 (para o filme da direita). O bot contabiliza os votos instantaneamente sem necessidade de recarregar a página.',
    image: '/updates/votação_no_chat.png',
    badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    icon: MessageSquare
  },
  {
    id: 'duelo-screen',
    tag: 'Ao Vivo',
    title: '3. Tela de Duelo (Versus Screen)',
    summary: 'Acompanhe a batalha em tempo real com cronômetro e porcentagens.',
    description: 'Visual reformulado para a live! Exibe as capas dos dois filmes frente a frente, o relógio regressivo do round, a barra de progresso de votos em porcentagem e controles rápidos para pular ou encerrar o confronto.',
    image: '/updates/tela_do_duelo.png',
    badgeColor: 'bg-violet-500/20 text-violet-300 border-violet-500/30',
    icon: Sparkles
  },
  {
    id: 'campeao-screen',
    tag: 'Final',
    title: '4. Pódio do Campeão e Histórico',
    summary: 'Celebração com troféu e resumo completo dos resultados do campeonato.',
    description: 'Ao encerrar a Grande Final, o filme vencedor ganha destaque de Campeão com troféu brilhante, nota TMDB e um painel com o histórico de todos os confrontos das Semifinais e Final.',
    image: '/updates/filme_vitorioso.png',
    badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    icon: Trophy
  }
];

export default function UpdatePopup() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [zoomImage, setZoomImage] = useState(null);

  useEffect(() => {
    const storageKey = `uzflix_update_seen_${CURRENT_UPDATE_VERSION}`;
    const hasSeen = localStorage.getItem(storageKey);
    if (!hasSeen) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    const storageKey = `uzflix_update_seen_${CURRENT_UPDATE_VERSION}`;
    localStorage.setItem(storageKey, 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  const currentUpdate = UPDATES_LIST[activeStep];
  const IconComponent = currentUpdate.icon;

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md animate-fadeIn">
      {/* Container Principal do Modal */}
      <div className="relative w-full max-w-4xl bg-[#131127] border border-violet-500/30 rounded-2xl sm:rounded-3xl shadow-2xl shadow-violet-950/60 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Barra Superior Decorativa Gradient */}
        <div className="h-1.5 w-full bg-gradient-to-r from-violet-500 via-cyan-400 to-amber-400" />

        {/* Header do Popup */}
        <div className="p-4 sm:p-6 pb-3 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-violet-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg sm:text-xl font-bold text-white tracking-tight">
                  Novidades da Atualização
                </h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-md bg-violet-500/20 border border-violet-500/40 text-violet-300">
                  v1.2.0
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Novo Sistema de Torneio Mata-Mata & Duelos no Chat da Twitch!
              </p>
            </div>
          </div>

          <button
            onClick={handleClose}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            title="Fechar novidades"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Seleção de Abas (Navegação Rápida) */}
        <div className="px-4 sm:px-6 pt-3 flex gap-2 overflow-x-auto no-scrollbar border-b border-white/5">
          {UPDATES_LIST.map((item, idx) => {
            const ItemIcon = item.icon;
            const isActive = idx === activeStep;
            return (
              <button
                key={item.id}
                onClick={() => setActiveStep(idx)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-all border ${
                  isActive
                    ? 'bg-violet-600/30 text-violet-200 border-violet-500/60 shadow-lg shadow-violet-900/30'
                    : 'bg-white/[0.03] text-gray-400 border-white/5 hover:bg-white/10 hover:text-gray-200'
                }`}
              >
                <ItemIcon className={`w-3.5 h-3.5 ${isActive ? 'text-violet-300' : 'text-gray-400'}`} />
                <span>{item.tag}</span>
              </button>
            );
          })}
        </div>

        {/* Conteúdo Principal (Scrollable) */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 flex flex-col lg:flex-row gap-5 items-stretch">
          
          {/* Lado Esquerdo: Texto & Descrição da Novidade */}
          <div className="flex-1 flex flex-col justify-between space-y-4">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${currentUpdate.badgeColor}`}>
                  {currentUpdate.tag}
                </span>
                <span className="text-xs text-gray-500 font-medium">
                  {activeStep + 1} de {UPDATES_LIST.length}
                </span>
              </div>

              <h3 className="text-lg sm:text-xl font-bold text-white mb-2 leading-snug">
                {currentUpdate.title}
              </h3>

              <p className="text-sm font-medium text-violet-300/90 mb-3">
                {currentUpdate.summary}
              </p>

              <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/5 text-xs sm:text-sm text-gray-300 leading-relaxed">
                {currentUpdate.description}
              </div>
            </div>

            {/* Dicas Rápidas */}
            <div className="p-3 rounded-xl bg-violet-500/10 border border-violet-500/20 text-xs text-violet-200 flex items-start gap-2">
              <span className="text-base">💡</span>
              <span>
                <strong>Como testar:</strong> Abra a aba <span className="underline">Votação</span> ou acesse o <span className="underline">Painel Admin</span> para gerenciar os confrontos ao vivo.
              </span>
            </div>
          </div>

          {/* Lado Direito: Preview da Imagem com opção de Zoom */}
          <div className="flex-1 flex flex-col">
            <div 
              onClick={() => setZoomImage(currentUpdate)}
              className="group relative w-full h-56 sm:h-64 lg:h-full min-h-[220px] rounded-xl overflow-hidden border border-white/10 bg-black/50 cursor-pointer shadow-inner flex items-center justify-center"
            >
              <img
                src={currentUpdate.image}
                alt={currentUpdate.title}
                className="w-full h-full object-contain bg-[#0a0814] group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end justify-between p-3">
                <span className="text-xs text-white/90 font-medium flex items-center gap-1">
                  <ZoomIn className="w-4 h-4 text-violet-400" /> Clique para ampliar a imagem
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* Rodapé: Controle de Navegação & Conclusão */}
        <div className="p-4 sm:p-5 bg-black/40 border-t border-white/10 flex items-center justify-between gap-3">
          {/* Bolinhas de Progresso */}
          <div className="flex items-center gap-1.5">
            {UPDATES_LIST.map((_, i) => (
              <button
                key={i}
                onClick={() => setActiveStep(i)}
                className={`w-2.5 h-2.5 rounded-full transition-all ${
                  i === activeStep
                    ? 'w-6 bg-violet-400'
                    : 'bg-white/20 hover:bg-white/40'
                }`}
                title={`Ir para atualização ${i + 1}`}
              />
            ))}
          </div>

          {/* Botões Próximo / Anterior / Concluir */}
          <div className="flex items-center gap-2">
            {activeStep > 0 && (
              <button
                onClick={() => setActiveStep(prev => prev - 1)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold text-gray-300 bg-white/5 border border-white/10 hover:bg-white/10 transition-colors flex items-center gap-1"
              >
                <ChevronLeft className="w-4 h-4" /> Anterior
              </button>
            )}

            {activeStep < UPDATES_LIST.length - 1 ? (
              <button
                onClick={() => setActiveStep(prev => prev + 1)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-violet-600 hover:bg-violet-500 transition-all flex items-center gap-1 shadow-lg shadow-violet-600/30"
              >
                Próxima <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handleClose}
                className="px-5 py-2 rounded-xl text-xs font-bold text-gray-950 bg-gradient-to-r from-violet-400 to-cyan-400 hover:brightness-110 transition-all shadow-lg shadow-cyan-500/20"
              >
                🚀 Entendi, vamos lá!
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Lightbox / Modal de Zoom da Imagem */}
      {zoomImage && (
        <div 
          className="fixed inset-0 z-[100000] bg-black/90 backdrop-blur-lg flex flex-col items-center justify-center p-4"
          onClick={() => setZoomImage(null)}
        >
          <div className="relative max-w-5xl w-full max-h-[85vh] flex flex-col items-center">
            <button
              onClick={() => setZoomImage(null)}
              className="absolute -top-10 right-0 p-2 text-gray-300 hover:text-white bg-white/10 rounded-full"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={zoomImage.image}
              alt={zoomImage.title}
              className="max-w-full max-h-[80vh] rounded-xl object-contain shadow-2xl border border-white/10"
            />
            <p className="mt-3 text-sm text-gray-300 font-medium text-center bg-black/60 px-4 py-1.5 rounded-full border border-white/10">
              {zoomImage.title}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
