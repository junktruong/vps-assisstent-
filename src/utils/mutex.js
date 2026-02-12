class Mutex {
  constructor() {
    this.locked = false;
    this.queue = [];
  }

  acquire() {
    return new Promise((resolve) => {
      const ticket = () => {
        this.locked = true;
        resolve(() => this.release());
      };

      if (!this.locked) {
        ticket();
      } else {
        this.queue.push(ticket);
      }
    });
  }

  release() {
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      next();
      return;
    }
    this.locked = false;
  }

  async runExclusive(fn) {
    const release = await this.acquire();
    try {
      return await fn();
    } finally {
      release();
    }
  }
}

module.exports = { Mutex };
