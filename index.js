const Discord = require('discord.js');
const client = new Discord.Client();
//
const expParser = require('mathjs-expression-parser');

/* eslint-disable */
// To keep these formatted nicely
const booleanTrueValues =  ['true',  't', '1', 'on',  'yes', 'y', 'sure'];
const booleanFalseValues = ['false', 'f', '0', 'off', 'no',  'n', 'nah' ];
/* eslint-enable */

client.once('ready', () => {
	for (const [k, v] of Object.entries(commands)) {
		v.name = k;
	}
	console.log("Login successful!");
});

const botChannel = 'robots-talking-to-robots';

const commandPres = ['!', 'bot ', 'ok google ', 'ok google, ', '<@!656662948231774209> '];

const commands = {
	help: {
		aliases: ['usage', '?'],
		args: [
			{
				type: 'string',
				key: 'command',
				def: null,
				name: 'Command',
				optional: true
			}
		],
		desc: 'Get information on available commands',
		func: commandHelp
	},
	/*calc: {
		aliases: ['whats'],
		args: [
			{
				type: 'raw',
				key: 'equation',
				name: 'Equation'
			}
		],
		desc: 'Parse an equation',
		func: data => 'Result: ' + expParser.eval(data.equation).toString()
	}*/
};

function commandHelp(data) {
	let out = '```\n';
	if (data.command !== null) {
		const command = fromNameOrAlias(data.command);
		if (!command) {
			return 'Command does not exist';
		}

		out += '---[[ ' + command.name + ' ]]---\n';
		out += command.desc + '\n\n';
		out += 'ALIASES:\n';
		out += command.aliases.join(', ') + '\n\n';
		out += 'USAGE: ([required arg], <optional arg>)\n';
		out += command.name + ' ';
		for (const arg of command.args) {
			out += (arg.optional ? '<' : '[') + arg.name + (arg.optional ? '>' : ']') + ':' + arg.type + ' ';
		}
		out += '\n';
	} else {
		// command list
		out += 'Commands: (' + Object.keys(commands).length + '):\n';
		for (const [name, command] of Object.entries(commands)) {
			out += '- ' + name + ' (' + command.aliases.join(', ') + ')\n';
		}
	}
	out += '```';
	return out;
}

client.on('message', message => {
	if (botChannel === undefined || message.channel.name === botChannel) {
		for (const pre of commandPres) {
			if (message.content.startsWith(pre)) {
				const msg = message.content.substring(pre.length);
				handleCommand(message.channel, msg);
			}
		}
	}
});

function fromNameOrAlias(name) {
	if (commands[name]) { return commands[name]; }
	for (const cmd of Object.values(commands)) {
		if (cmd.aliases.indexOf(name) !== -1) {
			return cmd;
		}
	}
	return null;
}

function handleCommand(channel, msg) {
	let msgSplit = splitMessage(msg);
	const command = fromNameOrAlias(msgSplit.shift());
	if (command === null) {
		channel.send('No such command');
		return;
	}

	const args = command.args.slice(0);
	const data = {};

	for (let i = args.length - 1; msgSplit.length < args.length; i--) {
		if (i === -1) {
			channel.send('Not enough arguments');
			return;
		}
		if (args[i].optional) {
			data[args[i].key] = args[i].def;
			args.splice(i, 1);
		}
	}

	if (args.length === 1 && args[0].type === 'raw') {
		msgSplit = [msgSplit.join(' ')];
	}

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		const ret = parseType(arg, msgSplit.shift());
		if (ret.error) {
			channel.send('Invalid argument ' + (i + 1) + ' (' + arg.name + '): ' + ret.error);
			return;
		}
		data[arg.key] = ret.value;
	}

	if (msgSplit.length > 0) {
		channel.send('Too many arguments');
		return;
	}

	const ret = command.func(data);
	if (ret && typeof ret === 'string') {
		channel.send(ret);
	}
}

function parseType(desc, arg) {
	if (parseFunctions[desc.type]) {
		return parseFunctions[desc.type](desc, arg);
	}
	return { error: 'Invalid argument type in command descriptor' };
}

function isPositiveInteger(n) {
	return n >>> 0 === parseFloat(n);
}

var parseFunctions = {
	// Text is raw, just return value
	text: function(desc, value) {
		return { value: value };
	},
	// Same as text
	raw: (...data) => parseFunctions.text(...data),
	string: (...data) => parseFunctions.text(...data),
	// Get min and max (or take defaults)
	// Get string versions of them, printed ranges like (0, 180427349023) don't look very nice
	// Parse, check not NaN and in range
	float: function(desc, value) {
		const min = desc.min || 0;
		const max = desc.max || Number.MAX_SAFE_INTEGER;
		const minPrintVal = min <= -Number.MAX_SAFE_INTEGER ? '-inf' : min;
		const maxPrintVal = max >= Number.MAX_SAFE_INTEGER ? 'inf' : max;

		const parsed = +value;
		if (isNaN(parsed)) {
			return { error: '"' + value + '" is not a number' };
		} else {
			if (parsed < min || parsed > max) return { error: '"' + value + '" not in range (' + minPrintVal + ',' + maxPrintVal + ')' };
			return { value: parsed };
		}
	},
	// Call above and ensure value % 1 == 0
	int: function(desc, value) {
		const ret = parseFunctions.float(desc, value);
		if (ret.error) return ret;
		if (ret.value % 1 !== 0) return { error: '"' + ret.value + '" is not an integer' };
		return ret;
	},
	// Check against list of true and false values above
	boolean: function(desc, value) {
		const lowerValue = value.toLowerCase();
		if (booleanTrueValues.indexOf(lowerValue) !== -1) {
			return { value: true };
		} else if (booleanFalseValues.indexOf(lowerValue) !== -1) {
			return { value: false };
		} else {
			return { error: '"' + value + '" could not be recognised as a boolean value, try true/false, y/n, on/off, etc.' };
		}
	},
	// Allow for options input by typing their payload, or doing #index
	options: function(desc, value) {
		if (!desc.options) throw new Error('No options in desc');

		if (value[0] === '#' && isPositiveInteger(value.substring(1))) {
			// Selecting by doing #1 to #length
			const idx = +value.substring(1);
			if (idx >= 1 && idx <= desc.options.length) {
				return { value: desc.options[idx - 1].payload };
			} else {
				return { error: 'Index "' + idx + '" not in range (1,' + desc.options.length + ')' };
			}
		} else {
			// Selecting by typing payload (case insensitive)
			const options = [];
			for (const option of desc.options) {
				options.push(option.payload.toLowerCase());
			}
			const idx = options.indexOf(value.toLowerCase());
			if (idx === -1) {
				return { error: 'Invalid option, please choose from: ' + options.join(', ') };
			} else {
				return { value: desc.options[idx].payload };
			}
		}
	}
};

function splitMessage(str) {
	var regex = /[^\s"]+|"([^"]*)"/gi;
	var out = [];

	do {
		var match = regex.exec(str);
		if (match != null) {
			out.push(match[1] ? match[1] : match[0]);
		}
	} while (match != null);
	return out;
}

client.login('NjU2NjYyOTQ4MjMxNzc0MjA5.Xfl8FA.6h65jSoFQes09Q6zc08qW1blaC8');