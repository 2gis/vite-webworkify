import gamma from 'gamma';

addEventListener('message', (event) => {
    console.log('Message from main thread:', event.data);
    postMessage(`Hello from Worker ${event.data} (${gamma(Math.random())})`);
});
