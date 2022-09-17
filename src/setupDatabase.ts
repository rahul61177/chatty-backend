import Logger from 'bunyan';
import mongoose from 'mongoose';

import { config } from './config';

const log: Logger = config.createLogger('setupDatabase');

export default () => {
    const connect = () => {
        mongoose
            .connect(`${config.DATABASE_URL}`)
            .then(() => {
                console.log('Successfully connected to database');
            })
            .catch((error) => {
                console.log('Error connecting to database - ', error);
                return process.exit(1);
            });
    };
    connect();

    mongoose.connection.on('disconnected', connect);
};
