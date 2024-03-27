export class SmartCache {
	constructor({ms = 60000, max_cached = 10000, max_pending = 100}) {
		this.cached = new Map();
		this.pending = new Map();
		this.timer = undefined;
		this.ms = ms;
		this.max_cached = max_cached;
		this.max_pending = max_pending;
	}
	remove_expired() {
		let {cached} = this;
		let t = Date.now();
		for (let [key, [exp]] of cached) {
			if (exp < t) {
				cached.delete(key);
			}
		}
	}
	add(key, value) {
		let {cached, max_cached: max_cache, ms} = this;
		if (cached.size >= max_cache) { // we need room
			for (let key of [...cached.keys()].slice(-Math.ceil(max_cache/16))) { // remove batch
				cached.delete(key);
			}
		}
		cached.set(key, [Date.now() + ms, value]); // add cache entry
		if (this.timer) return; // already scheduled
		this.timer = setInterval(() => {
			this.remove_expired(); // remove expired
			if (!cached.size) { // all expired
				clearTimeout(this.timer);
				this.timer = undefined; // stop
			}
		}, ms + 1).unref(); // schedule
	}
	get(key, fn) {
		let {cached} = this;
		let p = cached.get(key); // fastpath, check cache
		if (Array.isArray(p)) { 
			let [exp, q] = p;
			if (exp > Date.now()) return q; // still valid
			cached.remove(key); // expired
		}
		let {pending, max_pending} = this;
		if (pending.size >= max_pending) throw new Error('busy'); // too many in-flight
		p = pending.get(key);
		if (p) return p; // already in-flight
		let q = fn(key); // begin
		p = q.catch(() => {}).then(() => { // we got an answer
			pending.delete(key); // remove from pending
			this.add(key, q); // add original to cache
			return q; // resolve to original
		});
		pending.set(key, p); // remember in-flight
		return p; // return original
	}

}