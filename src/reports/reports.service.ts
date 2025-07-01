import { Injectable, Inject } from '@nestjs/common';
import { WINSTON_MODULE_NEST_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import fs from 'fs';
import path from 'path';
import { performance } from 'perf_hooks';

@Injectable()
export class ReportsService {
  private states = {
    accounts: 'idle',
    yearly: 'idle',
    fs: 'idle',
  };

  private jobQueue: Array<() => Promise<void>> = [];
  private activeJob: boolean = false;
  private readonly workerUrl = process.env.WORKER_URL || 'http://localhost:8080';

  constructor(
    @Inject(WINSTON_MODULE_NEST_PROVIDER)
    private readonly logger: Logger,
  ) {}

  state(scope: string) {
    return this.states[scope];
  }

  private log(scope: string) {
    this.logger.log({level:'info', message:`${scope} ${this.state(scope)}`})
  }

  private async runNextJob() {
    if (this.activeJob || this.jobQueue.length === 0) return;

    this.activeJob = true;
    const job = this.jobQueue.shift();

    try {
      await job?.();
    } catch (err) {
      console.error('Report job failed:', err);
    }

    this.activeJob = false;
    this.runNextJob(); // run next job if any
  }

  private enqueue(job: () => Promise<void>) {
    this.jobQueue.push(job);
    this.runNextJob(); // try starting immediately if idle
  }

  generateAsyncReport(scope: string) {
    if (this.state(scope) === 'starting') return;
    switch (scope) {
      case 'accounts':
        return this.enqueue(this.accounts.bind(this));
      case 'yearly':
        return this.enqueue(this.yearly.bind(this));
      case 'fs':
        return this.enqueue(this.fs.bind(this));
    }
  }

  async generateReportFromWorker(scope: string) {
    if (this.state(scope) === 'starting') return;
    
    const reportType = scope;
    const inputFolder = "./tmp";
    const outputPath = `./out/${scope}_go.csv`;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 seconds timeout
    const response = await fetch(`${this.workerUrl}/build-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reportType,
          inputFolder,
          outputPath
        }),
        signal: controller.signal
      });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return; //TODO capture error
    }

    const data = await response.json();
    const workerTime = data.duration
    this.states[scope] = `finished in ${(workerTime / 1000).toFixed(2)}`;

  }

  async accounts() {
    return this.build('accounts', ReportsService.parseAcountLine, (records, outputFile) => {
      const output = ['Account,Balance'];
      for (const [account, balance] of Object.entries(records)) {
        output.push(`${account},${balance.toFixed(2)}`);
      }
      fs.writeFileSync(outputFile, output.join('\n'));
    });
  }

  async yearly() {
    return this.build('yearly', ReportsService.parseYearlyLine, (records, outputFile) => {
      const output = ['Financial Year,Cash Balance'];
      Object.keys(records)
        .sort()
        .forEach((year) => {
          output.push(`${year},${records[year].toFixed(2)}`);
        });
      fs.writeFileSync(outputFile, output.join('\n'));
    });
  }

  async fs() {
    const categories = {
      'Income Statement': {
        Revenues: ['Sales Revenue'],
        Expenses: [
          'Cost of Goods Sold',
          'Salaries Expense',
          'Rent Expense',
          'Utilities Expense',
          'Interest Expense',
          'Tax Expense',
        ],
      },
      'Balance Sheet': {
        Assets: [
          'Cash',
          'Accounts Receivable',
          'Inventory',
          'Fixed Assets',
          'Prepaid Expenses',
        ],
        Liabilities: [
          'Accounts Payable',
          'Loan Payable',
          'Sales Tax Payable',
          'Accrued Liabilities',
          'Unearned Revenue',
          'Dividends Payable',
        ],
        Equity: ['Common Stock', 'Retained Earnings'],
      },
    };
    const balances: Record<string, number> = {};
    for (const section of Object.values(categories)) {
      for (const group of Object.values(section)) {
        for (const account of group) {
          balances[account] = 0;
        }
      }
    }
    return this.build(
      'fs',
      (line) => {
        const [, account, , debit, credit] = line.split(',');

        if (balances.hasOwnProperty(account)) {
          balances[account] +=
            parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
        }
      },
      (_, outputFile) => {
      const output: string[] = [];
      output.push('Basic Financial Statement');
      output.push('');
      output.push('Income Statement');
      let totalRevenue = 0;
      let totalExpenses = 0;
      for (const account of categories['Income Statement']['Revenues']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalRevenue += value;
      }
      for (const account of categories['Income Statement']['Expenses']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalExpenses += value;
      }
      output.push(`Net Income,${(totalRevenue - totalExpenses).toFixed(2)}`);
      output.push('');
      output.push('Balance Sheet');
      let totalAssets = 0;
      let totalLiabilities = 0;
      let totalEquity = 0;
      output.push('Assets');
      for (const account of categories['Balance Sheet']['Assets']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalAssets += value;
      }
      output.push(`Total Assets,${totalAssets.toFixed(2)}`);
      output.push('');
      output.push('Liabilities');
      for (const account of categories['Balance Sheet']['Liabilities']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalLiabilities += value;
      }
      output.push(`Total Liabilities,${totalLiabilities.toFixed(2)}`);
      output.push('');
      output.push('Equity');
      for (const account of categories['Balance Sheet']['Equity']) {
        const value = balances[account] || 0;
        output.push(`${account},${value.toFixed(2)}`);
        totalEquity += value;
      }
      output.push(
        `Retained Earnings (Net Income),${(totalRevenue - totalExpenses).toFixed(2)}`,
      );
      totalEquity += totalRevenue - totalExpenses;
      output.push(`Total Equity,${totalEquity.toFixed(2)}`);
      output.push('');
      output.push(
        `Assets = Liabilities + Equity, ${totalAssets.toFixed(2)} = ${(totalLiabilities + totalEquity).toFixed(2)}`,
      );
      fs.writeFileSync(outputFile, output.join('\n'));
    });
  }

  private static async parseFile(path: string, parseLineMethod:(line:string, record:Map<string, number>) => void): Promise<Map<string, number>> {
    return new Promise((resolve, reject) => {
      const accountBalances: Map<string, number> = new Map();
      const stream = fs.createReadStream(path);
      let buffer = ''
      stream.on('data', (chunk:Buffer) => {
        buffer += chunk.toString('ascii');
        const lines = buffer.split('\n')
        for (const line of lines.slice(0,-1)) {
          parseLineMethod(line, accountBalances);
        }
          
        buffer = lines.slice(-1)[0];
      })
      .on('end', () => {
        if (buffer !== '') {
          parseLineMethod(buffer, accountBalances);
        }
        resolve(accountBalances);
      })
      .on('error', reject)
    })
  }

  private static parseAcountLine(line: string, accountBalances:Map<string, number>) {
    const [, account, , debit, credit] = line.trim().split(',');
    if (!account) return;
    accountBalances[account] = (accountBalances[account] || 0) +
      parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
  }

  private static parseYearlyLine(line: string, records:Map<string, number>) {
    const [date, account, , debit, credit] = line.trim().split(',');
    if (account !== 'Cash') return
    const year = new Date(date).getFullYear();
    records[year] = (records[year] || 0) +
      parseFloat(String(debit || 0)) - parseFloat(String(credit || 0));
  }

  private async build(
    scope:string, 
    parsingLineMethod:(line:string, records:Map<string,number>) => void, 
    writingMethod:(records:Map<string,number>, outputFile:string) => void
  ) {

    this.states[scope] = 'starting';
    this.log(scope)
    const start = performance.now();
    const tmpDir = 'tmp';
    const outputFile = `out/${scope}.csv`;
    let records: Map<string, number> = new Map();
    const startGetFiles = performance.now();
    const files = fs.readdirSync(tmpDir).filter(file => file.endsWith('.csv') && file !== 'yearly.csv');
    this.logger.log({level:"info", message:`${scope} finished find files in ${((performance.now() - startGetFiles) / 1000).toFixed(2)}`});
    
    const startReadFiles = performance.now();

    const promises = files.map(file => {
      return ReportsService.parseFile(path.join(tmpDir, file), parsingLineMethod)
      .then(record => {
        for (const [account, balance] of Object.entries(record)) {
          records[account] = (records[account] || 0) + balance;
        }
      });
    });
    await Promise.all(promises);

    this.logger.log({level:"info", message:`${scope} finished reading files in ${((performance.now() - startReadFiles) / 1000).toFixed(2)}`})
    
    const startWriting = performance.now();

    await writingMethod(records, outputFile)

    this.logger.log({level:"info", message:`${scope} finished write report in ${((performance.now() - startWriting) / 1000).toFixed(2)}`})
   
    this.states[scope] = `finished in ${((performance.now() - start) / 1000).toFixed(2)}`;
    this.log(scope)
  }
}
