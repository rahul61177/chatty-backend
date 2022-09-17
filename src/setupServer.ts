import 'express-async-errors';

import Logger from 'bunyan';
import compression from 'compression';
import cookieSession from 'cookie-session';
import cors from 'cors';
import {
	Application,
	json,
	NextFunction,
	Request,
	Response,
	urlencoded,
} from 'express';
import helmet from 'helmet';
import hpp from 'hpp';
import http from 'http';
import HTTP_STATUS from 'http-status-codes';
import { createClient } from 'redis';
import { Server } from 'socket.io';

import { createAdapter } from '@socket.io/redis-adapter';

import { config } from './config';
import applicationRoutes from './routes';
import {
	CustomError,
	IErrorResponse,
} from './shared/globals/helpers/error-handler';

const SERVER_PORT = 5000;
const log: Logger = config.createLogger('server');

export class ChattyServer {
    private app: Application;

    constructor(app: Application) {
        this.app = app;
    }

    public start(): void {
        this.securityMiddleware(this.app);
        this.standardMiddleware(this.app);
        this.routesMiddleware(this.app);
        this.globalErrorHandler(this.app);
        this.startServer(this.app);
    }

    private securityMiddleware(app: Application): void {
        app.use(
            cookieSession({
                name: 'session',
                keys: [config.SECRET_KEY_ONE!, config.SECRET_KEY_TWO!],
                maxAge: 24 * 7 * 3600000,
                secure: config.NODE_ENV !== 'development',
            }),
        );
        app.use(hpp());
        app.use(helmet());
        app.use(
            cors({
                origin: config.CLIENT_URL,
                credentials: true,
                optionsSuccessStatus: 200,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            }),
        );
    }
    private standardMiddleware(app: Application): void {
        app.use(compression());
        app.use(json({limit: '50mb'}));
        app.use(urlencoded({extended: true, limit: '50mb'}));
    }
    private routesMiddleware(app: Application): void {
        applicationRoutes(app);
    }

    private globalErrorHandler(app: Application): void {
        app.all('*', (req: Request, res: Response) => {
            //For URLs that does not exist
            res.status(HTTP_STATUS.NOT_FOUND).json({
                message: `${req.originalUrl} not found`,
            });
        });

        app.use(
            (
                error: IErrorResponse,
                req: Request,
                res: Response,
                next: NextFunction,
            ) => {
                console.log(error);
                if (error instanceof CustomError) {
                    return res
                        .status(error.statusCode)
                        .json(error.serializeErrors());
                }
                next();
            },
        );
    }

    private async startServer(app: Application): Promise<void> {
        try {
            const httpServer: http.Server = new http.Server(app);
            const socketIO: Server = await this.createSocketIO(httpServer);
            this.startHttpServer(httpServer);
            this.socketIOConnections(socketIO);
        } catch (error) {
            console.log(error);
        }
    }

    private async createSocketIO(httpServer: http.Server): Promise<Server> {
        const io: Server = new Server(httpServer, {
            cors: {
                origin: config.CLIENT_URL,
                methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            },
        });
        const pubClient = createClient({url: config.REDIS_HOST});
        const subClient = pubClient.duplicate();
        await Promise.all([pubClient.connect(), subClient.connect()]);
        io.adapter(createAdapter(pubClient, subClient));
        return io;
    }

    private startHttpServer(httpServer: http.Server): void {
        console.log(`Server has started with process ${process.pid}`);
        httpServer.listen(SERVER_PORT, () => {
            console.log(`Server running on port ${SERVER_PORT}`);
        });
    }

    private socketIOConnections(io: Server): void {}
}
