// Reusable primitives — button, input, pill, dot, card. Styled via colors_and_type.css.
const Button = ({ variant = "secondary", size = "md", icon, children, ...rest }) => (
  <button className={`btn btn-${variant} ${size === "lg" ? "btn-lg" : size === "sm" ? "btn-sm" : ""}`} {...rest}>
    {icon ? <Icon name={icon} size={size === "sm" ? 12 : 14}/> : null}
    {children}
  </button>
);

const Input = React.forwardRef(({ error, ...rest }, ref) => (
  <input ref={ref} className={`input ${error ? "error" : ""}`} {...rest}/>
));

const Pill = ({ tone = "neutral", dot, children }) => (
  <span className={`pill ${tone === "neutral" ? "" : "pill-" + tone}`}>
    {dot ? <span className={`dot dot-${tone}`}/> : null}
    {children}
  </span>
);

const Dot = ({ tone = "idle" }) => <span className={`dot dot-${tone}`}/>;

const Card = ({ children, style }) => <div className="card" style={style}>{children}</div>;

const IconButton = ({ name, ...rest }) => (
  <button className="icon-btn" {...rest}>
    <Icon name={name} size={16}/>
  </button>
);

window.Button = Button;
window.Input = Input;
window.Pill = Pill;
window.Dot = Dot;
window.Card = Card;
window.IconButton = IconButton;
