import { Plus } from "lucide-react";
interface Props { activeUserName: string; onOpenNewRequest: () => void; }
export function EngineerWelcome({activeUserName, onOpenNewRequest}: Props): JSX.Element { return (<header className="engineer-welcome">
          <img className="engineer-welcome__photo" src="/login-bg-1920.jpg" srcSet="/login-bg-1280.jpg 1280w, /login-bg-1920.jpg 1920w, /login-bg-2560.jpg 2560w, /login-bg-3840.jpg 3840w" sizes="(max-width: 900px) 100vw, 80vw" alt="" decoding="async" draggable={false} />
          <div>
            <p className="engineer-nav-label">TU CENTRO DE OPERACIÓN</p>
            <h1>Hola, <span>{activeUserName.split(" ")[0]}</span></h1>
            <p>Todo listo para continuar. Estos son tus proyectos y pendientes.</p>
          </div>
          <button type="button" className="engineer-primary-action" onClick={onOpenNewRequest}><Plus size={18} />Nueva solicitud</button>
        </header>); }
