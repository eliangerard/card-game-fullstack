import { useState } from 'react';
import { motion } from 'framer-motion';
import { cardImage, cardLabel, TREATMENT_HELP } from '../../lib/cards';
import { Modal } from './Modal';
import { IconHelp } from './icons';

const COLORS = ['red', 'green', 'blue', 'yellow', 'multi'];
const TREATMENTS = ['transplant', 'thief', 'contagion', 'glove', 'medicalError'];

const CardThumb = ({ card, i = 0 }) => (
  <motion.figure
    className="rules-card"
    initial={{ opacity: 0, y: 16, rotate: -6 }}
    animate={{ opacity: 1, y: 0, rotate: 0 }}
    transition={{ delay: 0.04 * i, type: 'spring', stiffness: 300, damping: 20 }}
    whileHover={{ y: -6, rotate: i % 2 ? 3 : -3, scale: 1.06 }}
  >
    <img src={cardImage(card, 'sm')} alt={cardLabel(card)} loading="lazy" />
    <figcaption>{cardLabel(card)}</figcaption>
  </motion.figure>
);

const Row = ({ kind }) => (
  <div className="rules-row">
    {COLORS.map((color, i) => <CardThumb key={color} card={{ kind, color }} i={i} />)}
  </div>
);

// Reglas resumidas (la versión completa está en docs/RULES.md)
export const HowToPlayContent = () => (
  <div className="rules">
    <section className="rules-goal">
      <span className="rules-goal__badge">Objetivo</span>
      <p>
        Sé el primero en tener <b>4 órganos de distinto color</b> sanos en tu cuerpo.
        Pueden estar vacunados o inmunizados, pero <b>no infectados</b>. El órgano comodín cuenta como uno de los cuatro.
      </p>
    </section>

    <section>
      <h3>Tu turno</h3>
      <ol className="rules-steps">
        <li><b>Juega una carta</b> de tu mano <i>o</i> <b>descarta</b> de 1 a 3 cartas.</li>
        <li>Roba hasta volver a tener <b>3 cartas</b>.</li>
        <li>Tienes <b>40 segundos</b>: si se acaba el tiempo, se descarta una carta al azar.</li>
      </ol>
    </section>

    <section>
      <h3>Órganos</h3>
      <p>Van en tu cuerpo. No puedes tener dos del mismo color.</p>
      <Row kind="organ" />
    </section>

    <section>
      <h3>Roñas</h3>
      <p>
        Se juegan sobre un órgano del mismo color de <b>cualquier</b> jugador.
        Una roña lo <b>infecta</b>; una segunda roña lo <b>destruye</b>. Contra un órgano vacunado, se anulan.
      </p>
      <Row kind="virus" />
    </section>

    <section>
      <h3>Medicinas</h3>
      <p>
        Se juegan en tus órganos. Una medicina <b>cura</b> una infección o <b>vacuna</b> un órgano sano;
        dos medicinas lo <b>inmunizan</b> para siempre: ya nada le afecta.
      </p>
      <Row kind="medicine" />
    </section>

    <section>
      <h3>Tratamientos</h3>
      <div className="rules-treatments">
        {TREATMENTS.map((treatment, i) => (
          <div className="rules-treatment" key={treatment}>
            <CardThumb card={{ kind: 'treatment', treatment }} i={i} />
            <p>{TREATMENT_HELP[treatment]}</p>
          </div>
        ))}
      </div>
    </section>

    <section className="rules-tip">
      <p>
        <b>Comodín:</b> las cartas multicolor valen para cualquier color. Ojo: con un Trasplante o un Error médico
        puede ganar alguien que no está jugando el turno.
      </p>
    </section>
  </div>
);

// Botón que abre el modal de reglas
export const HowToPlayButton = ({ compact = false }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      {compact ? (
        <motion.button
          className="ui-icon-btn"
          onClick={() => setOpen(true)}
          whileHover={{ rotate: [0, -12, 12, 0] }}
          title="¿Cómo se juega?"
          aria-label="¿Cómo se juega?"
        >
          <IconHelp />
        </motion.button>
      ) : (
        <button className="ui-btn ui-btn--light ui-btn--sm" onClick={() => setOpen(true)}>
          <IconHelp /> ¿Cómo se juega?
        </button>
      )}
      <Modal open={open} onClose={() => setOpen(false)} title="¿Cómo se juega?" wide labelledBy="rules-title">
        <HowToPlayContent />
      </Modal>
    </>
  );
};
