function TomcatError(message, cause) {
	if( message instanceof Error ) {
		cause = message;
		message = message.message;
	}
	
	Error.call(this, message);
	this.name = 'TomcatError';
	this.message = message;
	this.arguments = [].slice.call(arguments);
	
	Error.captureStackTrace(this, arguments.callee);

	if( cause instanceof Error ) this.cause = cause;
}

TomcatError.prototype = Object.create(Error.prototype);
TomcatError.prototype.constructor = TomcatError;

module.exports = TomcatError;